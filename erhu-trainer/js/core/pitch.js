/* core/pitch.js — 麦克风 + 时域自相关音高检测（K-02/K-03） */
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});

  /** 运行环境是否具备麦克风条件（非安全上下文或无 API 时降级，K-03） */
  function micAvailable() {
    return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /** 自相关（AMDF 风格）+ 抛物线插值，检测窗 60–1200Hz */
  function autocorrelate(buf, sampleRate) {
    const SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.006) return null;

    // 掐头去尾：找首个低于阈值的过零附近，减小边缘反射
    const thres = 0.2;
    let r1 = 0, r2 = SIZE - 1;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    const b = buf.slice(r1, r2);
    const N = b.length;
    if (N < 256) return null;

    const c = new Float32Array(N);
    for (let lag = 0; lag < N; lag++) {
      let sum = 0;
      for (let j = 0; j < N - lag; j++) sum += b[j] * b[j + lag];
      c[lag] = sum;
    }
    let d = 0;
    while (d < N - 1 && c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < N; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    if (maxpos <= 0) return null;

    let T0 = maxpos;
    const x1 = T0 > 0 ? c[T0 - 1] : 0, x2 = c[T0], x3 = T0 < N - 1 ? c[T0 + 1] : 0;
    const a = (x1 + x3 - 2 * x2) / 2, bb = (x3 - x1) / 2;
    if (a) T0 = T0 - bb / (2 * a);

    const freq = sampleRate / T0;
    if (freq < 60 || freq > 1200) return null;
    return { freq, rms };
  }

  /** 单例麦克风拾音器：start/stop/detect，同一时间只允许一个持有者 */
  let _holder = null;
  class MicPitch {
    constructor(owner) { this.owner = owner || "anon"; this.stream = null; this.analyser = null; this.buf = null; }
    static get holder() { return _holder; }

    async start() {
      if (!micAvailable()) throw new Error("当前环境不支持麦克风（需 HTTPS / localhost，且已授权）");
      if (_holder && _holder !== this) throw new Error("麦克风被「" + _holder.owner + "」占用，请先在那边停止");
      if (this.stream) return;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const c = ET.audio.ctx();
      const src = c.createMediaStreamSource(this.stream);
      this.analyser = c.createAnalyser();
      this.analyser.fftSize = 2048;
      this.buf = new Float32Array(this.analyser.fftSize);
      src.connect(this.analyser); // 只分析、不回放
      _holder = this;
    }

    /** 返回 {freq, rms} 或 null */
    detect() {
      if (!this.analyser) return null;
      this.analyser.getFloatTimeDomainData(this.buf);
      return autocorrelate(this.buf, ET.audio.ctx().sampleRate);
    }

    stop() {
      if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
      this.analyser = null;
      if (_holder === this) _holder = null;
    }
  }

  ET.pitch = { micAvailable, autocorrelate, MicPitch };
})();
