/* modules/ear.js — 听音训练（E-01 ~ E-05，会话内统计不落库） */
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});

  const INTERVALS = {
    小二度: 1, 大二度: 2, 小三度: 3, 大三度: 4, 纯四度: 5,
    三全音: 6, 纯五度: 7, 小六度: 8, 大六度: 9, 小七度: 10, 大七度: 11, 纯八度: 12,
  };
  const INTERVAL_SETS = {
    入门: ["小三度", "大三度", "纯四度", "纯五度", "纯八度"],
    标准: ["小二度", "大二度", "小三度", "大三度", "纯四度", "三全音", "纯五度", "大六度"],
    全部: Object.keys(INTERVALS),
  };
  const CHORDS = {
    大三和弦: [0, 4, 7], 小三和弦: [0, 3, 7], 减三和弦: [0, 3, 6], 增三和弦: [0, 4, 8],
    大七和弦: [0, 4, 7, 11], 属七和弦: [0, 4, 7, 10],
  };
  const CHORD_SETS = { 三和弦: ["大三和弦", "小三和弦", "减三和弦", "增三和弦"], 含七和弦: Object.keys(CHORDS) };
  // D 大调旋律池：1 2 3 4 5 6 7 1'
  const MEL_POOL = [
    { m: 62, d: "1" }, { m: 64, d: "2" }, { m: 66, d: "3" }, { m: 67, d: "4" },
    { m: 69, d: "5" }, { m: 71, d: "6" }, { m: 73, d: "7" }, { m: 74, d: "1'" },
  ];

  function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  ET.Modules = ET.Modules || {};
  ET.Modules.ear = {
    init(el) {
      const st = {
        mode: "interval", level: "入门", pres: "旋律", n: 10,
        qNo: 0, q: null, answered: false,
        stats: {}, streak: 0, bestStreak: 0, sessionDone: false,
      };

      el.innerHTML = `
        <div class="card ear-top" style="margin-bottom:16px">
          <label class="field">题型
            <select id="eMode">
              <option value="interval">音程听辨</option>
              <option value="chord">和弦性质</option>
              <option value="dict">旋律听写</option>
              <option value="mixed">混合</option>
            </select>
          </label>
          <label class="field" id="eLevelWrap">难度
            <select id="eLevel"><option>入门</option><option>标准</option><option>全部</option></select>
          </label>
          <label class="field" id="ePresWrap">呈现
            <select id="ePres"><option>旋律</option><option>和声</option></select>
          </label>
          <label class="field">每组题数
            <select id="eN"><option>5</option><option selected>10</option><option>15</option></select>
          </label>
          <button class="btn primary" id="eStart">开始一组</button>
          <div class="ear-progress grow" style="text-align:right">第 <b id="eQNo">0</b> / <span id="eNTotal">0</span> 题 · 连对 <b id="eStreak">0</b></div>
        </div>
        <div class="card">
          <div id="eBody" style="text-align:center; color:var(--text-dim); padding:30px 0">
            选择题型后点「开始一组」。答题只在当前会话内统计，刷新即清空。
          </div>
        </div>`;

      const $ = (id) => el.querySelector("#" + id);
      const vol = () => 0.4;

      $("eMode").onchange = () => { st.mode = $("eMode").value; syncConfig(); };
      $("eLevel").onchange = () => { st.level = $("eLevel").value; };
      $("ePres").onchange = () => { st.pres = $("ePres").value; };
      $("eN").onchange = () => { st.n = +$("eN").value; };
      $("eStart").onclick = startSession;

      function syncConfig() {
        const intervalish = st.mode === "interval" || st.mode === "mixed";
        $("ePresWrap").style.display = st.mode === "interval" ? "" : "none";
        $("eLevelWrap").style.display = st.mode === "chord" ? "none" : "";
        if (st.mode === "chord") { /* 和弦用 CHORD_SETS，难度选择隐藏 */ }
        void intervalish;
      }

      function startSession() {
        ET.audio.unlock();
        st.qNo = 0; st.stats = {}; st.streak = 0; st.bestStreak = 0; st.sessionDone = false;
        $("eNTotal").textContent = st.n;
        nextQuestion();
      }

      function playQuestion(q) {
        const t0 = ET.audio.now() + 0.08;
        if (q.type === "interval") {
          if (st.pres === "和声") ET.synth.chord([q.f1, q.f2], t0, 1.0, vol() * 1.2);
          else ET.synth.melody([{ freq: q.f1 }, { freq: q.f2 }], t0, 0.55, 0.75, vol());
        } else if (q.type === "chord") {
          ET.synth.chord(q.freqs, t0, 1.1, vol() * 1.2);
        } else if (q.type === "dict") {
          ET.synth.melody(q.notes.map((n) => ({ freq: n.f })), t0, 0.38, 0.5, vol());
        }
      }

      function makeQuestion() {
        const type = st.mode === "mixed" ? pick(["interval", "chord", "dict"]) : st.mode;
        const a4v = ET.prefs.get("a4", 440);
        if (type === "interval") {
          const set = INTERVAL_SETS[st.mode === "mixed" ? "标准" : st.level] || INTERVAL_SETS.标准;
          const name = pick(set);
          const root = 60 + Math.floor(Math.random() * 10);
          const f1 = ET.notation.midiToFreq(root, a4v);
          const f2 = ET.notation.midiToFreq(root + INTERVALS[name], a4v);
          const q = { type, answer: name, options: shuffle(set), f1, f2,
            prompt: "听这两个音的音程关系（先给根音）" };
          q.play = () => playQuestion(q);
          return q;
        }
        if (type === "chord") {
          const name = pick(CHORD_SETS["三和弦"]);
          const root = 60 + Math.floor(Math.random() * 8);
          const freqs = CHORDS[name].map((iv) => ET.notation.midiToFreq(root + iv, a4v));
          const q = { type, answer: name, options: shuffle(CHORD_SETS["三和弦"]), freqs,
            prompt: "听这个和弦的性质" };
          q.play = () => playQuestion(q);
          return q;
        }
        // 旋律听写
        const len = 6;
        const notes = Array.from({ length: len }, () => pick(MEL_POOL));
        const hideCount = 2 + Math.floor(Math.random() * 2); // 2-3 个
        const idxs = shuffle(Array.from({ length: len - 1 }, (_, i) => i + 1)).slice(0, hideCount); // 不藏第一音
        const slots = notes.map((n, i) => ({ ...n, hidden: idxs.includes(i) }));
        const q = { type, answer: slots, options: null, notes: slots.map((s) => ({ freq: ET.notation.midiToFreq(s.m, a4v) })),
          prompt: `听这段 ${len} 音旋律，把缺的音填进空槽（第一音已给出）` };
        q.play = () => playQuestion(q);
        return q;
      }

      function nextQuestion() {
        if (st.qNo >= st.n) return summary();
        st.qNo++;
        $("eQNo").textContent = st.qNo;
        st.q = makeQuestion();
        st.answered = false;
        st.q.play();
        renderQuestion();
      }

      function renderQuestion() {
        const q = st.q;
        const body = $("eBody");
        if (q.type !== "dict") {
          body.innerHTML = `
            <div class="ear-question"><b>${typeLabel(q.type)}</b> · ${q.prompt}</div>
            <div class="ear-options">${q.options.map((o) => `<button class="btn" data-v="${o}">${o}</button>`).join("")}</div>
            <div class="ear-feedback" id="eFb"></div>
            <div class="ear-actions">
              <button class="btn" id="eReplay">重播</button>
            </div>`;
          body.querySelectorAll(".ear-options button").forEach((b) => {
            b.onclick = () => answerMC(b);
          });
          $("eReplay").onclick = () => st.q.play();
        } else {
          body.innerHTML = `
            <div class="ear-question"><b>旋律听写</b> · ${q.prompt}</div>
            <div class="dict-slots" id="eSlots"></div>
            <div class="dict-palette" id="ePal"></div>
            <div class="ear-feedback" id="eFb"></div>
            <div class="ear-actions">
              <button class="btn" id="eReplay">重播</button>
              <button class="btn primary" id="eCheck">检查</button>
            </div>`;
          renderDict();
          $("eReplay").onclick = () => st.q.play();
          $("eCheck").onclick = checkDict;
        }
        updateProgress();
      }

      function renderDict() {
        const slots = $("eSlots"), pal = $("ePal");
        slots.innerHTML = ""; pal.innerHTML = "";
        st.q.answer.forEach((s, i) => {
          const d = document.createElement("div");
          d.className = "dict-slot" + (s.hidden ? " filled" : " fixed");
          d.dataset.i = i;
          const shown = s.hidden ? st.fills && st.fills[i] : s.d;
          d.innerHTML = octWrap(shown || (s.hidden ? "?" : s.d), s.hidden && !(st.fills && st.fills[i]));
          if (s.hidden) d.onclick = () => { st.activeSlot = i; markActiveSlot(); };
          slots.appendChild(d);
        });
        st.fills = st.fills || {};
        MEL_POOL.forEach((p) => {
          const b = document.createElement("button");
          b.className = "btn"; b.textContent = p.d;
          b.onclick = () => {
            st.fills = st.fills || {};
            st.fills[st.activeSlot != null ? st.activeSlot : nextEmptySlot()] = p.d;
            renderDict();
          };
          pal.appendChild(b);
        });
        markActiveSlot();
      }
      function octWrap(text, empty) {
        if (empty || !text) return text || "?";
        if (text.endsWith("'")) return `<span class="oct-up">${text.slice(0, -1)}</span>`;
        return text;
      }
      function nextEmptySlot() {
        for (let i = 0; i < st.q.answer.length; i++) {
          if (st.q.answer[i].hidden && !(st.fills && st.fills[i])) return i;
        }
        return 0;
      }
      function markActiveSlot() {
        $("eSlots").querySelectorAll(".dict-slot").forEach((d) => {
          d.style.outline = (+d.dataset.i === st.activeSlot && st.q.answer[+d.dataset.i].hidden) ? "2px solid var(--accent)" : "";
        });
      }

      function answerMC(btn) {
        if (st.answered) return;
        st.answered = true;
        const q = st.q;
        const ok = btn.dataset.v === q.answer;
        btn.classList.add(ok ? "correct" : "wrong");
        if (!ok) {
          $("eBody").querySelectorAll(".ear-options button").forEach((b) => {
            if (b.dataset.v === q.answer) b.classList.add("correct");
            b.disabled = true;
          });
        } else btn.disabled = true;
        record(q.type, ok);
        showFb(ok, `正确答案：${q.answer}`);
        appendNext();
      }

      function checkDict() {
        if (st.answered) return;
        st.answered = true;
        let ok = true;
        $("eSlots").querySelectorAll(".dict-slot").forEach((d) => {
          const i = +d.dataset.i;
          const s = st.q.answer[i];
          if (!s.hidden) return;
          const fill = st.fills && st.fills[i];
          const good = fill === s.d;
          d.classList.add(good ? "ok" : "bad");
          if (!good) { d.innerHTML = octWrap(s.d); ok = false; }
        });
        record("dict", ok);
        showFb(ok, ok ? "全对！" : "错音已用红色标出，正确音已填上");
        appendNext();
      }

      function record(type, ok) {
        st.stats[type] = st.stats[type] || { ok: 0, n: 0 };
        st.stats[type].n++;
        if (ok) { st.stats[type].ok++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); }
        else st.streak = 0;
        updateProgress();
      }
      function showFb(ok, extra) {
        const fb = $("eFb");
        fb.className = "ear-feedback " + (ok ? "ok" : "err");
        fb.textContent = (ok ? "✓ 答对了 " : "✗ 不对 · ") + extra;
      }
      function appendNext() {
        const actions = $("eBody").querySelector(".ear-actions");
        const b = document.createElement("button");
        b.className = "btn primary";
        b.textContent = st.qNo >= st.n ? "看本组成绩" : "下一题";
        b.onclick = nextQuestion;
        actions.appendChild(b);
      }

      function typeLabel(t) { return t === "interval" ? "音程听辨" : t === "chord" ? "和弦听辨" : "旋律听写"; }
      function updateProgress() {
        $("eStreak").textContent = st.streak;
      }

      function summary() {
        st.sessionDone = true;
        let ok = 0, n = 0;
        const rows = Object.entries(st.stats).map(([t, s]) => {
          ok += s.ok; n += s.n;
          return `<tr><td>${typeLabel(t)}</td><td class="mono">${s.ok} / ${s.n}</td><td class="mono">${Math.round((s.ok / s.n) * 100)}%</td></tr>`;
        }).join("");
        const pct = n ? Math.round((ok / n) * 100) : 0;
        $("eQNo").textContent = st.n;
        $("eBody").innerHTML = `
          <div class="ear-summary">
            <div class="tiny">本组正确率（仅本会话，不保存）</div>
            <div class="big">${pct}%</div>
            <div class="muted">连对最多 ${st.bestStreak} 题</div>
            <table><thead><tr><th>题型</th><th>对 / 总</th><th>正确率</th></tr></thead><tbody>${rows}</tbody></table>
            <div class="ear-actions" style="justify-content:center">
              <button class="btn primary" id="eAgain">再来一组</button>
            </div>
          </div>`;
        $("eAgain").onclick = startSession;
      }

      syncConfig();
      this._api = { stopAll: () => {} };
    },
    api() { return this._api; },
  };
})();
