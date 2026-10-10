/* app.js — 入口：Tab 路由 / 偏好 / 快捷键 / SW 注册 */
(function () {
  "use strict";
  const ET = (window.ET = window.ET || {});

  const DEFAULTS = {
    theme: "google", volume: 1.0, a4: 440,
  };

  // 主题列表（value 与 css/themes.css 中 html[data-theme] 一一对应）
  const THEMES = [
    { value: "google", label: "谷歌风格（Material）" },
    { value: "bauhaus", label: "包豪斯风格" },
    { value: "y2k", label: "千禧 Y2K 风格" },
    { value: "cyberpunk", label: "赛博朋克霓虹" },
    { value: "dark", label: "深色（工业风）" },
    { value: "light", label: "经典浅色" },
  ];

  // ---------- 偏好（同步内存 + 异步落库，单 blob 存储）----------
  let prefs = { ...DEFAULTS };
  let saveTimer = 0;
  ET.prefs = {
    get(k, def) { return k in prefs ? prefs[k] : def; },
    set(k, v) {
      prefs[k] = v;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => ET.store.set("prefs", prefs), 150);
    },
    data: () => prefs,
  };

  ET.toast = function (msg) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(ET.toast._t);
    ET.toast._t = setTimeout(() => el.classList.remove("show"), 2400);
  };

  // ---------- 设置页 ----------
  function renderSettings(el) {
    el.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>外观</h3>
          <div class="row">
            <label class="field">主题
              <select id="stTheme">${THEMES.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}</select>
            </label>
            <label class="field grow">主音量
              <span style="display:inline-flex;align-items:center;gap:8px">
                <input type="range" id="stVol" min="0" max="2" step="0.05" style="flex:1">
                <output id="stVolVal" style="min-width:2.6em;text-align:right;font-variant-numeric:tabular-nums">1.00</output>
              </span>
            </label>
          </div>
          <div class="row" style="margin-top:8px;align-items:center">
            <label class="switch"><input type="checkbox" id="stWake"><span class="track"></span>播放时保持屏幕常亮</label>
            <span class="tiny" id="stWakeHint" style="flex:1"></span>
          </div>
        </div>
        <div class="card">
          <h3>音频基准</h3>
          <div class="calib" style="margin-bottom:12px">
            A4 = <input type="number" id="stA4" min="430" max="450" step="1"> Hz
          </div>
          <div class="tiny">调音器与音准反馈共用该基准；标准 440，可与乐队合奏时按需微调。</div>
        </div>
        <div class="card">
          <h3>数据</h3>
          <div class="tiny" style="margin-bottom:10px">本应用不联网、无账号。仅偏好设置存于浏览器 IndexedDB（不可用时降级 localStorage）。</div>
          <button class="btn danger" id="stReset">恢复默认设置</button>
        </div>
        <div class="card">
          <h3>关于</h3>
          <div class="tiny" style="line-height:1.9">
            二胡练习台 · 静态单页应用，零后端、零第三方库、零网络请求。<br>
            节拍精度：AudioContext 前瞻调度；音高检测：时域自相关。<br>
            麦克风功能需 HTTPS 或 localhost（file:// 下自动降级隐藏）。
          </div>
        </div>
      </div>`;
    const $ = (id) => el.querySelector("#" + id);
    $("stTheme").value = prefs.theme;
    $("stVol").value = prefs.volume;
    $("stVolVal").textContent = (+prefs.volume).toFixed(2);
    $("stA4").value = prefs.a4;
    $("stTheme").onchange = (e) => { ET.prefs.set("theme", e.target.value); applyTheme(); };
    $("stVol").oninput = (e) => { const v = +e.target.value; ET.prefs.set("volume", v); ET.audio.setMasterVolume(v); $("stVolVal").textContent = v.toFixed(2); };
    // 屏幕常亮（K-07）：默认开启，仅播放期间持锁
    const wakeSupported = !!(ET.wakelock && ET.wakelock.supported());
    $("stWake").checked = ET.prefs.get("wakeOnPlay", true);
    $("stWakeHint").textContent = wakeSupported
      ? "跟练 / 节拍器播放期间保持亮屏，停止即恢复自动息屏"
      : "当前浏览器不支持屏幕常亮（iOS 需 16.4+；Android 的 Chrome / Edge 均支持）";
    $("stWake").onchange = (e) => {
      const v = e.target.checked;
      ET.prefs.set("wakeOnPlay", v);
      if (!v && ET.wakelock) ET.wakelock.releaseAll();
      ET.toast(v ? "播放时将保持屏幕常亮" : "已关闭屏幕常亮");
    };
    $("stA4").onchange = (e) => {
      const v = Math.max(430, Math.min(450, +e.target.value || 440));
      e.target.value = v; ET.prefs.set("a4", v);
      ET.toast("A4 基准已设为 " + v + " Hz");
    };
    $("stReset").onclick = async () => {
      prefs = { ...DEFAULTS };
      await ET.store.set("prefs", prefs);
      applyTheme();
      ET.audio.setMasterVolume(prefs.volume);
      $("stTheme").value = prefs.theme; $("stVol").value = prefs.volume; $("stVolVal").textContent = (+prefs.volume).toFixed(2); $("stA4").value = prefs.a4;
      ET.toast("已恢复默认");
    };
  }

  function applyTheme() {
    const t = ET.prefs.get("theme", "google");
    // 未知主题（旧数据/手改存储）兜底到默认谷歌风格
    document.documentElement.dataset.theme = THEMES.some((x) => x.value === t) ? t : "google";
  }

  // ---------- 启动 ----------
  const TABS = [
    { id: "metronome", label: "节拍器" },
    { id: "tuner", label: "调音器" },
    { id: "ear", label: "听音训练" },
    { id: "score", label: "乐谱跟练" },
    { id: "settings", label: "设置" },
  ];

  async function boot() {
    // 核心缺失守卫：脚本被防火墙/扩展拦截时给出可读错误，而非深层堆栈
    const missing = ["store", "audio", "Modules"].filter((k) => !(k in ET));
    if (missing.length) {
      console.error("核心模块未加载，缺:", missing.join(","));
      document.body.insertAdjacentHTML("beforeend",
        `<div style="position:fixed;inset:auto 16px 16px 16px;padding:12px;border-radius:10px;background:#7f1d1d;color:#fff;font-size:14px">核心脚本加载失败（缺 ${missing.join("、")}）。请确认 js/ 目录完整后刷新。</div>`);
      return;
    }
    await ET.store.init();
    const saved = await ET.store.get("prefs", null);
    if (saved && typeof saved === "object") prefs = { ...DEFAULTS, ...saved };
    applyTheme();
    ET.audio.setMasterVolume(prefs.volume);

    // 初始化各模块
    const mods = {
      metronome: ET.Modules.metronome,
      tuner: ET.Modules.tuner,
      ear: ET.Modules.ear,
      score: ET.Modules.score,
    };
    TABS.forEach((t) => {
      const panel = document.getElementById("panel-" + t.id);
      if (!panel) return;
      if (mods[t.id]) mods[t.id].init(panel);
      else if (t.id === "settings") renderSettings(panel);
    });

    // Tab 路由
    const nav = document.getElementById("tabs");
    nav.innerHTML = TABS.map((t, i) =>
      `<button data-tab="${t.id}" class="${i === 0 ? "active" : ""}">${t.label}</button>`).join("");
    function activate(id) {
      const prevBtn = nav.querySelector("button.active");
      const prevId = prevBtn ? prevBtn.dataset.tab : null;
      if (prevId && prevId !== id) {
        // 离开页面时停止当前模块的播放/录音/全屏等功能
        const api = ET.Modules[prevId] && ET.Modules[prevId].api ? ET.Modules[prevId].api() : null;
        if (api) {
          if (typeof api.cleanup === "function") api.cleanup();
          else if (typeof api.stop === "function") api.stop();
          else if (typeof api.toggle === "function" && api.isPlaying && api.isPlaying()) api.toggle();
        }
      }
      nav.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
      document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + id));
      // 滚动使当前标签可见（真实浏览器环境）
      const activeBtn = nav.querySelector(`button[data-tab="${id}"]`);
      if (activeBtn && typeof activeBtn.scrollIntoView === "function") {
        activeBtn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
      ET.prefs.set("lastTab", id);
    }
    nav.onclick = (e) => { const b = e.target.closest("button"); if (b) activate(b.dataset.tab); };
    const lastTab = ET.prefs.get("lastTab", "metronome");
    activate(TABS.some((t) => t.id === lastTab) ? lastTab : "metronome");

    // 首次手势解锁音频（移动端策略）
    const unlockOnce = () => { ET.audio.unlock(); window.removeEventListener("pointerdown", unlockOnce); };
    window.addEventListener("pointerdown", unlockOnce);

    // 键盘快捷键
    window.addEventListener("keydown", (e) => {
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (e.target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
      const activeTab = document.querySelector(".panel.active");
      if (!activeTab) return;
      const id = activeTab.id.replace("panel-", "");
      if (e.code === "Space") {
        e.preventDefault();
        if (id === "score") ET.Modules.score.api() && ET.Modules.score.api().toggle();
        else if (id === "metronome") ET.Modules.metronome.api() && ET.Modules.metronome.api().toggle();
      } else if (id === "score" && (e.key === "[" || e.key === "]")) {
        ET.Modules.score.api() && ET.Modules.score.api().setAB(e.key === "[" ? "A" : "B");
      }
    });

    // Service Worker（仅 http/https；file:// 自动跳过，K-05/K-06）
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      const hadController = Boolean(navigator.serviceWorker.controller);
      // updateViaCache: none —— sw.js 自身的更新检查不能被 HTTP 缓存拦住
      navigator.serviceWorker
        .register("sw.js", { updateViaCache: "none" })
        .then((reg) => {
          reg.update().catch(() => {});
          // 标签页从后台切回前台时再查一次，避免长期挂着的页面停在旧版本
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") reg.update().catch(() => {});
          });
        })
        .catch(() => {});
      // 只有「早已被 SW 接管」的页面才需要在新 SW 接管后刷新一次；首次安装不打断用户
      let _swReloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (_swReloading || !hadController) return;
        _swReloading = true;
        location.reload();
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
