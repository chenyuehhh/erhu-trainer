/* modules/tuner.js — 调音器（T-01 ~ T-07） */
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});

  ET.Modules = ET.Modules || {};
  ET.Modules.tuner = {
    init(el) {
      const P = ET.prefs;
      const st = { mic: null, on: false, raf: 0, target: null, hist: [], refTimer: 0 };

      el.innerHTML = `
        <div class="tuner-wrap">
          <div class="card">
            <div class="row spread">
              <h3 style="margin:0">拾音检测</h3>
              <button class="btn primary" id="tnMic">启动麦克风</button>
            </div>
            <div class="tuner-readout" style="margin-top:10px">
              <div class="tuner-note" id="tnNote">—<span class="oct"></span></div>
              <div class="tuner-cents" id="tnCents">待检测</div>
              <div class="tuner-hz" id="tnHz">— Hz</div>
            </div>
            <div class="needle-scale">
              <div class="rail"></div><div class="good"></div>
              ${[-50, -25, 0, 25, 50].map((v) => `<div class="tick" style="left:${50 + v}%"></div><div class="mark" style="left:${50 + v}%">${v > 0 ? "+" + v : v}</div>`).join("")}
              <div class="needle" id="tnNeedle"></div>
            </div>
            <div class="tuner-status" id="tnStatus">对照目标：自由模式（显示最近音）</div>
          </div>
          <div class="card">
            <h3>定弦预设</h3>
            <label class="field">乐器 / 弦式<select id="tnPreset"></select></label>
            <div class="preset-list" style="margin-top:10px">
              <div class="string-btns" id="tnStrings"></div>
              <div class="tiny">点击琴弦按钮：播放参考音并作为对照目标；再点一次停止。不选目标则为自由模式。</div>
            </div>
            <h3 style="margin-top:16px">基准音高</h3>
            <div class="calib">
              A4 = <input type="number" id="tnA4" min="430" max="450" step="1"> Hz
              <span class="tiny">范围 430–450</span>
            </div>
            <div id="tnDegrade" class="notice warn" style="display:none; margin-top:14px">
              当前环境无法使用麦克风（需 HTTPS 或 localhost，且已授权）。参考音播放不受影响。
            </div>
          </div>
        </div>`;

      const $ = (id) => el.querySelector("#" + id);
      $("tnA4").value = P.get("a4", 440);
      $("tnA4").onchange = (e) => {
        let v = Math.max(430, Math.min(450, +e.target.value || 440));
        e.target.value = v; P.set("a4", v);
      };

      // 预设下拉
      const sel = $("tnPreset");
      ET.tunings.forEach((g) => {
        const og = document.createElement("optgroup");
        og.label = g.group;
        g.items.forEach((it) => {
          const o = document.createElement("option");
          o.value = it.id; o.textContent = it.name;
          og.appendChild(o);
        });
        sel.appendChild(og);
      });
      const saved = P.get("tnPreset", "erhu-d");
      sel.value = saved;
      sel.onchange = () => { P.set("tnPreset", sel.value); renderStrings(); clearTarget(); };

      function currentPreset() {
        for (const g of ET.tunings) {
          const it = g.items.find((x) => x.id === sel.value);
          if (it) return it;
        }
        return ET.tunings[0].items[0];
      }
      function renderStrings() {
        const box = $("tnStrings");
        box.innerHTML = "";
        currentPreset().strings.forEach((s, i) => {
          const b = document.createElement("button");
          b.className = "btn string-btn";
          b.innerHTML = `<span class="n">${ET.notation.midiToNote(ET.notation.noteToMidi(s.n))}</span><span class="l">${s.l}</span>`;
          b.onclick = () => playRef(b, s.n, i);
          box.appendChild(b);
        });
      }
      function playRef(btn, noteName, idx) {
        ET.audio.unlock();
        if (st.refIdx === idx) { // 再点一次 → 停
          stopRef(); return;
        }
        stopRef();
        st.refIdx = idx;
        const f = ET.notation.noteToFreq(noteName, P.get("a4", 440));
        const t0 = ET.audio.now() + 0.03;
        // 长参考音：3 次衰减叠加，共约 2.4s
        for (let k = 0; k < 3; k++) {
          ET.synth.tone({ freq: f, t: t0 + k * 0.8, dur: 0.72, vol: 0.35, type: "triangle" });
        }
        btn.classList.add("playing");
        st.refTimer = setTimeout(() => stopRef(), 2500);
        setTarget(noteName);
      }
      function stopRef() {
        clearTimeout(st.refTimer);
        st.refIdx = null;
        el.querySelectorAll(".string-btn.playing").forEach((b) => b.classList.remove("playing"));
      }
      function setTarget(noteName) {
        st.target = ET.notation.noteToMidi(noteName);
        $("tnStatus").textContent = "对照目标：" + noteName + "（偏差按此音计）";
      }
      function clearTarget() {
        st.target = null;
        $("tnStatus").textContent = "对照目标：自由模式（显示最近音）";
      }

      async function toggleMic() {
        if (st.on) {
          st.on = false; cancelAnimationFrame(st.raf);
          st.mic.stop();
          $("tnMic").textContent = "启动麦克风"; $("tnMic").classList.add("primary");
          $("tnStatus").textContent = "已停止";
          return;
        }
        try {
          if (!st.mic) st.mic = new ET.pitch.MicPitch("tuner");
          await st.mic.start();
          st.on = true;
          $("tnMic").textContent = "停止拾音"; $("tnMic").classList.remove("primary");
          $("tnStatus").textContent = "对照目标：" + (st.target ? ET.notation.midiToNote(st.target) : "自由模式");
          loop();
        } catch (e) {
          ET.toast(e.message || "麦克风启动失败");
          if (e.message && e.message.indexOf("占用") >= 0) ET.toast(e.message);
        }
      }

      function loop() {
        if (!st.on) return;
        const r = st.mic.detect();
        const noteEl = $("tnNote"), centsEl = $("tnCents"), hzEl = $("tnHz"), needle = $("tnNeedle");
        if (r) {
          st.hist.push(r); if (st.hist.length > 8) st.hist.shift();
          const a4v = P.get("a4", 440);
          let midi, cents;
          if (st.target != null) {
            const f = ET.notation.midiToFreq(st.target, a4v);
            cents = ET.notation.centsBetween(r.freq, f);
            midi = st.target;
          } else {
            const near = ET.notation.freqToNearest(r.freq, a4v);
            cents = near.cents; midi = near.midi;
          }
          // 平滑：取最近几帧中位数
          st.centHist = st.centHist || []; st.centHist.push(cents);
          if (st.centHist.length > 5) st.centHist.shift();
          const sorted = [...st.centHist].sort((a, b) => a - b);
          const med = sorted[Math.floor(sorted.length / 2)];
          const name = ET.notation.midiToNote(midi);
          const letter = name.replace(/-?\d+$/, "");
          const octv = name.slice(letter.length);
          noteEl.innerHTML = letter + `<span class="oct">${octv}</span>`;
          centsEl.textContent = (med > 0 ? "+" : "") + med + " 音分";
          centsEl.className = "tuner-cents " + (Math.abs(med) <= 5 ? "good" : Math.abs(med) > 30 ? "far" : "");
          hzEl.textContent = r.freq.toFixed(1) + " Hz";
          needle.style.transform = `translateX(calc(-50% + ${Math.max(-50, Math.min(50, med))}% / 2))`;
          needle.className = "needle " + (Math.abs(med) <= 5 ? "good" : Math.abs(med) > 30 ? "far" : "");
          // 稳定度：近 5 帧音分极差 < 8 且 rms 足够
          const spread = sorted.length ? sorted[sorted.length - 1] - sorted[0] : 99;
          $("tnStatus").textContent = (spread < 8 ? "● 稳定 " : "○ 检测中 ") +
            "· 对照目标：" + (st.target != null ? ET.notation.midiToNote(st.target) : "自由模式（最近音）");
        } else {
          st.centHist = [];
          hzEl.textContent = "— Hz";
        }
        st.raf = requestAnimationFrame(loop);
      }

      $("tnMic").onclick = toggleMic;
      renderStrings();

      if (!ET.pitch.micAvailable()) $("tnDegrade").style.display = "block";
      this._api = { stopAll: () => { if (st.on) toggleMic(); stopRef(); } };
    },
    api() { return this._api; },
  };
})();
