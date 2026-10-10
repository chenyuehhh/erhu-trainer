/* core/wakelock.js — 屏幕常亮（Screen Wake Lock API，K-07）
 * 策略：仅在播放期间持锁（跟练 / 节拍器），停止即释放，常亮与省电兼顾。
 * - 需要 HTTPS 或 localhost（线上站点天然满足）；iOS 16.4+ / 现代 Android 浏览器支持
 * - 页面切后台时系统会强制释放锁；回前台且仍在播放 → 自动补锁（visibilitychange）
 * - 不支持的浏览器全部静默 no-op，设置页给出提示
 */
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});

  let lock = null;           // 当前 WakeLockSentinel
  const holders = new Set(); // 持锁模块标签（score / metronome / ...）

  function supported() {
    return typeof navigator !== "undefined" && "wakeLock" in navigator;
  }

  async function request_() {
    if (!supported() || !holders.size || lock) return;
    try {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { lock = null; });
    } catch (e) {
      lock = null; // 系统/浏览器拒绝（如低电量模式）→ 静默降级
    }
  }

  async function acquire(tag) {
    if (!ET.prefs.get("wakeOnPlay", true)) return;
    holders.add(tag);
    if (typeof document === "undefined" || document.visibilityState === "visible") await request_();
  }

  function release(tag) {
    holders.delete(tag);
    if (!holders.size && lock) {
      try { lock.release(); } catch (e) { /* 已释放 */ }
      lock = null;
    }
  }

  function releaseAll() {
    holders.clear();
    if (lock) {
      try { lock.release(); } catch (e) { /* 已释放 */ }
      lock = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && holders.size && !lock) request_();
  });

  ET.wakelock = { acquire, release, releaseAll, supported };
})();
