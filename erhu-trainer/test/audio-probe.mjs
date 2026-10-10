/* test/audio-probe.mjs — 乐谱跟练「播放无声」取证脚本（只读探针，不改业务代码）
 * 流程：开本地页 → 切乐谱跟练 → 挂合成器探针 → 真实点击播放 → 采样 master 总线 RMS → 导出偏好与调用计数
 * 运行：node test/audio-probe.mjs  （需先起 tools/serve.mjs）
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
function pathResolve(...parts) {
  let p = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (/^[A-Za-z]:/.test(seg) || seg.startsWith("/")) p = seg;
    else p = p.replace(/[\\/]+$/, "") + "/" + seg;
  }
  return p;
}

const NODE = process.execPath;
const AB = "C:\\Users\\Administrator\\.workbuddy\\binaries\\node\\versions\\22.22.2-2\\node_modules\\agent-browser\\bin\\agent-browser.js";
const SESSION = "erhu-audio";

function ab(args, timeout = 60000) {
  return execFileSync(NODE, [AB, "--session", SESSION, ...args], {
    encoding: "utf8",
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
}
function parseAb(json) {
  // agent-browser eval 会双层 stringify，逐步解包
  let x = json;
  for (let i = 0; i < 3; i++) {
    if (typeof x === "string") {
      try { x = JSON.parse(x); } catch { return x; }
    } else break;
  }
  return x;
}

const out = { steps: [], collect: null, metroCollect: null, errors: [] };
function step(name, fn) {
  try {
    const r = fn();
    out.steps.push({ name, ok: true, brief: String(r).slice(0, 300) });
    console.log("[ok]", name, String(r).slice(0, 200));
  } catch (e) {
    out.steps.push({ name, ok: false, err: String(e && e.message || e) });
    out.errors.push(name + ": " + String(e && e.message || e));
    console.log("[FAIL]", name, String(e && e.message || e).slice(0, 300));
  }
}

// 1) 打开页面
step("open", () => ab(["open", "http://127.0.0.1:8931/"]));

// 2) 切到乐谱跟练 + 按会长的真实 prefs 复现状态 + 挂探针（不改任何业务逻辑，只包一层计数/捕获）
step("instrument", () => ab(["eval", String(function instrument() {
  if (window.__probe) { document.querySelector('button[data-tab="score"]').click(); return "already instrumented"; }
  document.querySelector('button[data-tab="score"]').click();
  // 复现会长的持久化状态（Edge IndexedDB 解码结果）
  const ET = window.ET;
  ET.prefs.set("volume", 0.8); ET.audio.setMasterVolume(0.8);
  ET.prefs.set("sSpeed", 0.5);
  const c = ET.audio.ctx();
  if (c.state === "suspended") c.resume();
  const an = c.createAnalyser(); an.fftSize = 2048;
  ET.audio.master().connect(an);
  window.__an = an;
  window.__probe = { stringVoice: 0, tick: 0, svErr: [], tickErr: [], lastSv: null, lastTick: null };
  const _sv = ET.synth.stringVoice.bind(ET.synth);
  const _tk = ET.synth.tick.bind(ET.synth);
  ET.synth.stringVoice = function (o) {
    window.__probe.stringVoice++;
    try { window.__probe.lastSv = JSON.parse(JSON.stringify({ freq: o.freq, t: o.t, dur: o.dur, type: o.type, vol: o.vol })); } catch (e) {}
    try { return _sv(o); } catch (e) { window.__probe.svErr.push(String(e && e.message || e)); }
  };
  ET.synth.tick = function (o) {
    window.__probe.tick++;
    try { window.__probe.lastTick = JSON.parse(JSON.stringify({ t: o.t, accent: o.accent, vol: o.vol })); } catch (e) {}
    try { return _tk(o); } catch (e) { window.__probe.tickErr.push(String(e && e.message || e)); }
  };
  const t = document.querySelector("#tabs button.active");
  return "instrumented tab=" + (t ? t.textContent : "?");
}.toString().replace(/^function instrument\(\) \{/, "(() => {").replace(/\}$/, "})()"))]));

// 3) 真实点击播放（受信任手势）
step("click-play", () => ab(["click", "#scPlay"]));

// 4) 等待 4.5 秒（覆盖预备拍 + 若干音符）
step("sleep", () => { execFileSync(NODE, ["-e", "setTimeout(()=>{},4500)"]); return "waited 4.5s"; });

// 5) 采样 master 总线 + 收探针数据
step("collect", () => {
  const raw = ab(["eval", String(function collect() {
    const an = window.__an, c = window.ET.audio.ctx();
    const buf = new Float32Array(an.fftSize);
    const frames = [];
    return new Promise((res) => {
      let n = 0;
      const t = () => {
        an.getFloatTimeDomainData(buf);
        let p = 0, s = 0;
        for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > p) p = v; s += v * v; }
        frames.push({ peak: p, rms: Math.sqrt(s / buf.length) });
        if (++n < 30) return requestAnimationFrame(t);
        res({
          scoreRMS: { peak: Math.max(...frames.map(f => f.peak)), avg: frames.reduce((a, f) => a + f.rms, 0) / frames.length },
          probe: window.__probe,
          ctxState: c.state, currentTime: c.currentTime,
          masterGain: window.ET.audio.master().gain.value,
          playing: !!document.querySelector("#scPlay") && /停止/.test(document.querySelector("#scPlay").textContent),
          prefs: window.ET.prefs.data(),
        });
      };
      setInterval(t, 33);
    });
  }.toString().replace(/^function collect\(\) \{/, "(() => {").replace(/\}$/, "})()"))], 90000);
  out.collect = parseAb(raw);
  return "collected";
});

// 6) 停止乐谱播放，切节拍器做对照组（同页同总线）
step("stop-score", () => ab(["click", "#scPlay"]));
step("metro-tab", () => ab(["eval", 'document.querySelector(\'button[data-tab="metronome"]\').click(); "metro tab"']));
step("metro-play", () => ab(["click", "#mPlay"]));
step("sleep2", () => { execFileSync(NODE, ["-e", "setTimeout(()=>{},2500)"]); return "waited 2.5s"; });
step("collect-metro", () => {
  const raw = ab(["eval", String(function collectMetro() {
    const an = window.__an, c = window.ET.audio.ctx();
    const buf = new Float32Array(an.fftSize);
    return new Promise((res) => {
      let n = 0; let peak = 0; let sum = 0;
      const t = () => {
        an.getFloatTimeDomainData(buf);
        let p = 0, s = 0;
        for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > p) p = v; s += v * v; }
        if (p > peak) peak = p;
        sum += Math.sqrt(s / buf.length);
        if (++n < 30) return requestAnimationFrame(t);
        res({ metroRMS: { peak, avg: sum / n }, tickTotal: window.__probe.tick });
      };
      setInterval(t, 33);
    });
  }.toString().replace(/^function collectMetro\(\) \{/, "(() => {").replace(/\}$/, "})()"))], 90000);
  out.metroCollect = parseAb(raw);
  return "collected-metro";
});

// 7) 停掉节拍器
step("metro-stop", () => ab(["click", "#mPlay"]));

const outFile = path.join(ROOT, "test", "_audio_probe_result.json");
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log("WROTE", outFile);
