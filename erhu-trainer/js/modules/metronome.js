/* modules/metronome.js — 节拍器（M-01 ~ M-10 + 计时 + 全屏专注模式） */
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});

  const METERS = ["2/4", "3/4", "4/4", "6/8"];
  const SUBS = [
    { v: 1, label: "整拍" }, { v: 2, label: "八分" },
    { v: 3, label: "三连" }, { v: 4, label: "十六分" },
  ];
  const TIMBRES = [
    { v: "wood", label: "木鱼" }, { v: "sine", label: "正弦" }, { v: "click", label: "点击" },
  ];

  ET.Modules = ET.Modules || {};
  ET.Modules.metronome = {
    init(el) {
      const P = ET.prefs;
      const S = {
        bpm: P.get("mBpm", 80),
        meter: P.get("mMeter", "4/4"),
        sub: P.get("mSub", 1),
        accent: P.get("mAccent", true),
        timbre: P.get("mTimbre", "wood"),
        vol: P.get("mVol", 0.7),
        gradOn: P.get("mGradOn", false),
        gradEvery: P.get("mGradEvery", 4),
        gradStep: P.get("mGradStep", 2),
        gradMax: P.get("mGradMax", 120),
        muteOn: P.get("mMuteOn", false),
        muteCycle: P.get("mMuteCycle", 8),
        muteCount: P.get("mMuteCount", 2),
      };
      const st = {
        playing: false, beat: 0, subBeat: 0, bar: 1,
        gradBars: 0, mutePattern: [], timeouts: [], taps: [],
      };

      el.innerHTML = `
        <div class="metro-root" id="mRoot">
          <button class="fs-exit btn" id="mFsExit" type="button" title="退出全屏 (Esc)">退出全屏</button>
          <button class="fs-settings-btn btn small" id="mFsSettings" type="button" title="显示 / 隐藏设置">显示设置</button>

          <div class="metro-wrap">
            <div class="card metro-main">
              <button class="fs-enter btn ghost" id="mFs" type="button" title="专注全屏模式">⛶ 全屏</button>

              <div class="bpm-display">
                <div class="num" id="mNum">${S.bpm}</div>
                <div class="unit">BPM · 每分钟拍数</div>
                <div class="timer-inline">
                  <span class="timer-num" id="mTimer">00:00:00</span>
                  <button class="btn small ghost" id="mTimerReset" type="button" title="计时清零">重置</button>
                </div>
                <div class="timer-cap">练习计时 · 暂停不计时</div>
              </div>

              <div class="pendulum-box"><div class="pendulum"><div class="arm" id="mArm"></div><div class="pivot"></div></div></div>
              <div class="beat-dots" id="mDots"></div>

              <div class="row" style="justify-content:center; margin-top:14px">
                <button class="btn primary" id="mPlay" style="min-width:140px">开始练习</button>
                <button class="btn small ghost" id="mBpmDown">−5</button>
                <button class="btn small ghost" id="mBpmUp">+5</button>
              </div>
              <div class="row" style="margin-top:16px">
                <span class="vlab">BPM</span>
                <input type="range" id="mBpm" min="30" max="300" step="1" value="${S.bpm}" class="grow">
                <input type="number" id="mBpmNum" min="30" max="300" value="${S.bpm}" style="width:76px">
              </div>
              <div class="stat-line"><span>小节 <b id="mBarCnt">0</b></span><span>拍 <b id="mBeatCnt">0</b></span></div>

              <div class="row" style="justify-content:center; margin-top:14px">
                <button class="btn tap-btn" id="mTap">Tap 打拍</button>
              </div>
              <div class="row" style="justify-content:center; margin-top:10px">
                <button class="btn small ghost" id="mSaveRec" type="button" title="记录本次练习（BPM / 拍号 / 时长）">保存本次练习记录</button>
              </div>
            </div>

            <div class="card metro-extras" id="mExtras">
              <section class="ext-group">
                <h3>基础节拍设置</h3>
                <div class="field-row">
                  <div><div class="tiny" style="margin-bottom:4px">拍号</div><div class="seg" id="mMeterSeg"></div></div>
                  <div><div class="tiny" style="margin-bottom:4px">细分</div><div class="seg" id="mSubSeg"></div></div>
                </div>
              </section>

              <section class="ext-group">
                <h3>音色音量</h3>
                <div class="row" style="margin-top:0">
                  <label class="field">音色
                    <select id="mTimbre">${TIMBRES.map((t) => `<option value="${t.v}">${t.label}</option>`).join("")}</select>
                  </label>
                  <label class="field grow">音量
                    <input type="range" id="mVol" min="0" max="1" step="0.05" value="${S.vol}">
                  </label>
                  <label class="switch" style="align-self:end"><input type="checkbox" id="mAccent" ${S.accent ? "checked" : ""}><span class="track"></span>首拍重音</label>
                </div>
              </section>

              <section class="ext-group">
                <h3>常用练习模式</h3>
                <div class="row">
                  <label class="switch"><input type="checkbox" id="mGradOn" ${S.gradOn ? "checked" : ""}><span class="track"></span>启用渐快</label>
                  <label class="field">每 <input type="number" id="mGradEvery" min="1" max="16" value="${S.gradEvery}" style="width:60px"> 小节</label>
                  <label class="field">+ <input type="number" id="mGradStep" min="1" max="20" value="${S.gradStep}" style="width:56px"> BPM</label>
                  <label class="field">上限 <input type="number" id="mGradMax" min="40" max="300" value="${S.gradMax}" style="width:72px"></label>
                </div>
                <div class="tiny" style="margin-top:8px">每 N 小节自动 +X BPM 直到上限，热身提速用。</div>
              </section>

              <section class="ext-group collapsed" id="mAdvGroup">
                <h3 class="ext-toggle" id="mAdvToggle" role="button" tabindex="0">高级设置 <span class="caret">▸</span></h3>
                <div class="ext-body">
                  <div class="row">
                    <label class="switch"><input type="checkbox" id="mMuteOn" ${S.muteOn ? "checked" : ""}><span class="track"></span>启用静音小节</label>
                    <label class="field">周期 <input type="number" id="mMuteCycle" min="4" max="16" value="${S.muteCycle}" style="width:60px"> 小节</label>
                    <label class="field">静音 <input type="number" id="mMuteCount" min="1" max="4" value="${S.muteCount}" style="width:56px"> 小节</label>
                  </div>
                  <div class="tiny" style="margin-top:8px">静音小节内不发声，靠内心拍感撑过去；圆点变黄提示当前在静音段。</div>
                </div>
              </section>
            </div>
          </div>
        </div>`;

      const $ = (id) => el.querySelector("#" + id);
      const dots = $("mDots"), arm = $("mArm");
      const root = $("mRoot");

      function beatSec() { return 60 / S.bpm / (S.meter === "6/8" ? 2 : 1); }
      function beatsPerBar() { return parseInt(S.meter, 10); }
      function totalSubs() { return beatsPerBar() * S.sub; }

      function renderDots() {
        const n = beatsPerBar();
        dots.innerHTML = "";
        for (let i = 0; i < n; i++) {
          const d = document.createElement("div");
          d.className = "dot" + (i === 0 && S.accent ? " acc" : "");
          dots.appendChild(d);
        }
      }
      function renderSegs() {
        $("mMeterSeg").innerHTML = METERS.map((m) => `<button data-v="${m}" class="${m === S.meter ? "on" : ""}">${m}</button>`).join("");
        $("mSubSeg").innerHTML = SUBS.map((s) => `<button data-v="${s.v}" class="${s.v === S.sub ? "on" : ""}">${s.label}</button>`).join("");
      }
      function setBpm(v, save) {
        v = Math.max(30, Math.min(300, Math.round(v)));
        S.bpm = v;
        $("mNum").textContent = v; $("mBpm").value = v; $("mBpmNum").value = v;
        if (save !== false) P.set("mBpm", v);
      }
      function setMeter(m) { S.meter = m; P.set("mMeter", m); renderDots(); renderSegs(); st.subBeat = 0; }
      function setSub(v) { S.sub = v; P.set("mSub", v); renderSegs(); st.subBeat = 0; }

      /* ---------- 练习计时 ---------- */
      const timer = { acc: 0, last: 0, running: false, iv: 0 };
      function fmtTimer(ms) {
        const s = Math.floor(ms / 1000);
        const hh = String(Math.floor(s / 3600)).padStart(2, "0");
        const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
        const ss = String(s % 60).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
      }
      function timerNow() { return timer.acc + (timer.running ? performance.now() - timer.last : 0); }
      function timerTick() { $("mTimer").textContent = fmtTimer(timerNow()); }
      function timerStart() {
        if (timer.running) return;
        timer.running = true; timer.last = performance.now();
        timer.iv = setInterval(timerTick, 250);
      }
      function timerPause() {
        if (!timer.running) return;
        timer.acc += performance.now() - timer.last;
        timer.running = false;
        clearInterval(timer.iv);
        timerTick();
      }
      function timerReset() {
        timer.acc = 0;
        if (timer.running) timer.last = performance.now();
        $("mTimer").textContent = "00:00:00";
      }

      function clearVisualTimers() { st.timeouts.forEach(clearTimeout); st.timeouts = []; }
      function visualAt(t, fn) {
        const delay = Math.max(0, (t - ET.audio.now()) * 1000);
        st.timeouts.push(setTimeout(fn, delay));
      }
      function flashBeat(beatIdx, muted) {
        const ds = dots.children;
        for (let i = 0; i < ds.length; i++) ds[i].classList.toggle("on", i === beatIdx % ds.length);
        dots.classList.toggle("muted-hint", !!muted);
        arm.style.transform = `translateX(-50%) rotate(${beatIdx % 2 === 0 ? -28 : 28}deg)`;
        $("mBarCnt").textContent = st.bar;
        $("mBeatCnt").textContent = st.gradBars * beatsPerBar() + beatIdx + 1;
      }

      function regenMutePattern() {
        const c = S.muteCycle, n = Math.min(S.muteCount, c - 1);
        const arr = new Array(c).fill(false);
        const idxs = Array.from({ length: c }, (_, i) => i);
        for (let i = idxs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idxs[i], idxs[j]] = [idxs[j], idxs[i]]; }
        for (let i = 0; i < n; i++) arr[idxs[i]] = true;
        st.mutePattern = arr;
      }

      // 前瞻调度核心：每回调排一个细分点，返回到下一点的秒差
      function schedule(t) {
        const sec = beatSec() / S.sub;
        const beatIdx = st.beat, subIdx = st.subBeat;
        const isBeatStart = subIdx === 0;
        const barPos = beatIdx % beatsPerBar();
        const barInCycle = (st.bar - 1) % Math.max(1, S.muteCycle);
        const muted = S.muteOn && st.mutePattern[barInCycle] === true;

        if (isBeatStart) visualAt(t, () => flashBeat(beatIdx, muted));

        if (!muted) {
          ET.synth.tick({
            t, accent: S.accent && isBeatStart && barPos === 0,
            timbre: S.timbre, vol: S.vol * (isBeatStart ? 1 : 0.55),
          });
        }

        // 推进
        st.subBeat++;
        if (st.subBeat >= S.sub) {
          st.subBeat = 0; st.beat++;
          if (st.beat % beatsPerBar() === 0) { // 小节边界
            st.beat = 0; st.bar++;
            st.gradBars++;
            if (S.gradOn && st.gradBars % Math.max(1, S.gradEvery) === 0 && S.bpm < S.gradMax) {
              const nb = Math.min(S.gradMax, S.bpm + S.gradStep);
              visualAt(t + sec, () => { setBpm(nb); if (st.playing) ET.toast(`渐快 → ${nb} BPM`); });
            }
            if (barInCycle === S.muteCycle - 1 || st.mutePattern.length !== S.muteCycle) regenMutePattern();
          }
        }
        return sec;
      }

      function start() {
        ET.audio.unlock();
        st.playing = true; st.beat = 0; st.subBeat = 0; st.bar = 1; st.gradBars = 0;
        ET.wakelock && ET.wakelock.acquire("metronome"); // 播放期间保持屏幕常亮（K-07）
        regenMutePattern();
        const pb = $("mPlay");
        pb.textContent = "停止"; pb.className = "btn stop";
        timerStart();
        st.sched = new ET.audio.Scheduler(schedule);
        st.sched.start();
      }
      function stop() {
        st.playing = false;
        ET.wakelock && ET.wakelock.release("metronome");
        if (st.sched) st.sched.stop();
        clearVisualTimers();
        dots.querySelectorAll(".dot").forEach((d) => d.classList.remove("on"));
        dots.classList.remove("muted-hint");
        arm.style.transform = "translateX(-50%) rotate(0deg)";
        const pb = $("mPlay");
        pb.textContent = "开始练习"; pb.className = "btn primary";
        timerPause();
      }
      function toggle() { st.playing ? stop() : start(); }

      /* ---------- 页内全屏专注模式（与乐谱跟练一致：类名切换收起其他内容，K-08） ---------- */
      function toggleFull() {
        const on = el.classList.toggle("metro-fullscreen");
        root.classList.toggle("fs", on);
        const btn = $("mFs");
        btn.textContent = on ? "✕ 退出全屏" : "⛶ 全屏";
        btn.classList.toggle("toggled", on);
        if (on) {
          // 进入全屏时收起临时设置浮层，保留最大主视觉
          root.classList.remove("fs-settings-open");
          $("mFsSettings").textContent = "显示设置";
        }
      }
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && el.classList.contains("metro-fullscreen")) toggleFull();
      });
      $("mFs").onclick = toggleFull;
      $("mFsExit").onclick = toggleFull;

      /* ---------- 事件绑定 ---------- */
      $("mPlay").onclick = toggle;
      $("mBpm").oninput = (e) => setBpm(+e.target.value);
      $("mBpmNum").onchange = (e) => setBpm(+e.target.value);
      $("mBpmDown").onclick = () => setBpm(S.bpm - 5);
      $("mBpmUp").onclick = () => setBpm(S.bpm + 5);
      $("mMeterSeg").onclick = (e) => { const b = e.target.closest("button"); if (b) setMeter(b.dataset.v); };
      $("mSubSeg").onclick = (e) => { const b = e.target.closest("button"); if (b) setSub(+b.dataset.v); };
      $("mTimbre").value = S.timbre;
      $("mTimbre").onchange = (e) => { S.timbre = e.target.value; P.set("mTimbre", S.timbre); };
      $("mVol").oninput = (e) => { S.vol = +e.target.value; P.set("mVol", S.vol); };
      $("mAccent").onchange = (e) => { S.accent = e.target.checked; P.set("mAccent", S.accent); };
      $("mGradOn").onchange = (e) => { S.gradOn = e.target.checked; P.set("mGradOn", S.gradOn); };
      [["mGradEvery", "mGradEvery"], ["mGradStep", "mGradStep"], ["mGradMax", "mGradMax"]].forEach(([id, key]) => {
        $(id).onchange = (e) => { S[key] = +e.target.value; P.set(key, S[key]); };
      });
      $("mMuteOn").onchange = (e) => { S.muteOn = e.target.checked; P.set("mMuteOn", S.muteOn); if (S.muteOn) regenMutePattern(); };
      [["mMuteCycle", "mMuteCycle"], ["mMuteCount", "mMuteCount"]].forEach(([id, key]) => {
        $(id).onchange = (e) => { S[key] = +e.target.value; P.set(key, S[key]); regenMutePattern(); };
      });
      $("mTap").onclick = () => {
        const now = performance.now();
        st.taps.push(now);
        if (st.taps.length > 6) st.taps.shift();
        if (st.taps.length >= 2) {
          let sum = 0;
          for (let i = 1; i < st.taps.length; i++) sum += st.taps[i] - st.taps[i - 1];
          const avg = sum / (st.taps.length - 1);
          if (avg > 0) setBpm(60000 / avg);
        }
      };

      // 计时：重置
      $("mTimerReset").onclick = timerReset;
      // 全屏：进入 / 退出已统一绑定为 toggleFull（见上方页内全屏）
      $("mFsSettings").onclick = () => {
        const open = root.classList.toggle("fs-settings-open");
        $("mFsSettings").textContent = open ? "隐藏设置" : "显示设置";
      };
      // 高级设置折叠
      const advToggle = () => {
        const g = $("mAdvGroup");
        const open = g.classList.toggle("open");
        g.classList.toggle("collapsed", !open);
      };
      $("mAdvToggle").onclick = advToggle;
      $("mAdvToggle").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); advToggle(); } };
      // P1：保存本次练习记录
      $("mSaveRec").onclick = () => {
        const dur = Math.round(timerNow() / 1000);
        if (dur <= 0) { ET.toast("没有可保存的练习时长"); return; }
        const rec = { ts: Date.now(), bpm: S.bpm, meter: S.meter, dur };
        const hist = P.get("mHistory", []);
        hist.unshift(rec);
        if (hist.length > 50) hist.length = 50;
        P.set("mHistory", hist);
        ET.toast(`已保存 ${S.bpm} BPM · ${S.meter} · ${fmtTimer(dur * 1000)}（共 ${hist.length} 条）`);
      };

      function cleanup() {
        stop();
        if (el.classList.contains("metro-fullscreen")) toggleFull();
      }

      renderDots(); renderSegs();
      this._api = { toggle, stop, isPlaying: () => st.playing, cleanup };
    },
    api() { return this._api; },
  };
})();
