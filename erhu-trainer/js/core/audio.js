/* core/audio.js — AudioContext 单例 + 主音量 + 前瞻调度器（K-01） */
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});

  let _ctx = null;
  let _master = null;
  let _limiter = null;

  // 主音量可视化上限：放开到 2.0，配合下游软限幅可安全 boost，不会削波破音
  const MAX_MASTER_VOLUME = 2.0;

  function ctx() {
    if (!_ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      _ctx = new AC();
      _master = _ctx.createGain();
      _master.gain.value = 0.8;
      // 软限幅（砖墙近似）：master 增益 >1.0 时压住瞬态，防止超出 0dBFS 削波
      _limiter = _ctx.createDynamicsCompressor();
      _limiter.threshold.value = -1;   // dB：超过 -1dB 即开始压缩
      _limiter.knee.value = 0;          // 硬拐点 → 砖墙感
      _limiter.ratio.value = 20;        // 高压缩比 → 近似限幅
      _limiter.attack.value = 0.003;    // 快起音，护瞬态
      _limiter.release.value = 0.25;    // 适中释放
      _master.connect(_limiter).connect(_ctx.destination);
    }
    if (_ctx.state === "suspended") _ctx.resume();
    return _ctx;
  }

  function master() { ctx(); return _master; }
  function setMasterVolume(v) { master().gain.value = Math.max(0, Math.min(MAX_MASTER_VOLUME, v)); }
  function now() { return ctx().currentTime; }

  /** 解锁（移动端首次手势） */
  function unlock() {
    ctx();
    if (_ctx.state === "suspended") return _ctx.resume();
    return Promise.resolve();
  }

  /**
   * 前瞻调度器：25ms 轮询，100ms 排程窗口。
   * cb(time) 返回距下一事件的秒数；返回 null/0/负值表示结束。
   */
  class Scheduler {
    constructor(cb) {
      this.cb = cb;
      this.timer = null;
      this.nextTime = 0;
      this.lookahead = 0.1;
      this.interval = 25;
    }
    start(fromTime) {
      this.stop();
      const c = ctx();
      this.nextTime = fromTime != null ? fromTime : c.currentTime + 0.08;
      this.tick();
      this.timer = setInterval(() => this.tick(), this.interval);
    }
    tick() {
      const c = ctx();
      let guard = 0;
      while (this.nextTime < c.currentTime + this.lookahead) {
        const delta = this.cb(this.nextTime);
        if (delta == null || !(delta > 0)) { this.stop(); return; }
        this.nextTime += delta;
        if (++guard > 512) { this.stop(); return; } // 防死循环
      }
    }
    stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
    get running() { return this.timer != null; }
  }

  ET.audio = { ctx, master, setMasterVolume, now, unlock, Scheduler };
})();
