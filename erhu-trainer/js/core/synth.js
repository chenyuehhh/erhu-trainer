/* core/synth.js — Web Audio 合成音色（D-04）：弦乐近似 / 参考音 / 节拍打点 / 和弦 */
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});
  const A = () => ET.audio;

  let _noise = null;
  function noiseBuffer(c) {
    if (_noise) return _noise;
    const len = c.sampleRate * 0.5;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    _noise = buf;
    return buf;
  }

  /**
   * 弦乐近似音（S-10）：锯齿波 + 60ms 慢起音 + 5.5Hz 轻颤音 + 低通。
   * opts: {freq, t, dur, type="sawtooth", vol=0.5, vib=true, attack=0.06, release=0.22, cutoff=2400}
   */
  function stringVoice(opts) {
    const c = A().ctx();
    const { freq, t, dur } = opts;
    const type = opts.type || "sawtooth";
    const vol = opts.vol != null ? opts.vol : 0.5;
    const attack = opts.attack != null ? opts.attack : 0.06;
    const release = opts.release != null ? opts.release : 0.22;

    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = opts.cutoff || 2400;
    lp.Q.value = 0.8;

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - 0.02));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur + release);

    if (opts.vib !== false && dur > 0.28) {
      const lfo = c.createOscillator();
      lfo.frequency.value = 5.5; // 轻颤音
      const lg = c.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(freq * 0.006, t + Math.min(0.3, dur * 0.6)); // ≈10 音分
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + release);
    }

    osc.connect(lp).connect(g).connect(A().master());
    osc.start(t); osc.stop(t + dur + release + 0.05);
  }

  /** 纯音（参考音 / 听音训练） */
  function tone(opts) {
    const c = A().ctx();
    const { freq, t } = opts;
    const dur = opts.dur != null ? opts.dur : 0.6;
    const vol = opts.vol != null ? opts.vol : 0.4;
    const attack = opts.attack != null ? opts.attack : 0.012;
    const osc = c.createOscillator();
    osc.type = opts.type || "sine";
    osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.08);
    osc.connect(g).connect(A().master());
    osc.start(t); osc.stop(t + dur + 0.12);
  }

  /** 和弦：轻微错落的纯音叠加 */
  function chord(freqs, t, dur, vol) {
    freqs.forEach((f, i) => {
      tone({ freq: f, t: t + i * 0.012, dur, vol: (vol || 0.3) / Math.sqrt(freqs.length), type: "triangle" });
    });
  }

  /** 节拍打点。timbre: "wood" | "sine" | "click" */
  function tick(opts) {
    const c = A().ctx();
    const t = opts.t;
    const accent = !!opts.accent;
    const vol = (opts.vol != null ? opts.vol : 0.6) * (accent ? 1 : 0.55);
    const timbre = opts.timbre || "wood";

    if (timbre === "sine") {
      tone({ freq: accent ? 1320 : 880, t, dur: 0.07, vol, attack: 0.002, type: "sine" });
      return;
    }
    if (timbre === "click") {
      const osc = c.createOscillator();
      osc.type = "square";
      osc.frequency.value = accent ? 2400 : 1900;
      const g = c.createGain();
      g.gain.setValueAtTime(vol * 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.02);
      osc.connect(g).connect(A().master());
      osc.start(t); osc.stop(t + 0.03);
      return;
    }
    // wood：噪声 + 带通（木鱼感）
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = accent ? 2400 : 1700;
    bp.Q.value = 9;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.055);
    src.connect(bp).connect(g).connect(A().master());
    src.start(t, Math.random() * 0.2, 0.08);
  }

  /** 一串旋律音（听音训练用） */
  function melody(notes, t, noteDur, gap, vol, type) {
    let cur = t;
    notes.forEach((n) => {
      tone({ freq: n.freq, t: cur, dur: noteDur, vol: vol || 0.4, type: type || "triangle" });
      cur += (gap != null ? gap : noteDur * 1.3);
    });
    return cur - t;
  }

  ET.synth = { stringVoice, tone, chord, tick, melody };
})();
