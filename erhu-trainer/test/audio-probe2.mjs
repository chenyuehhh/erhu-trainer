/* test/audio-probe2.mjs — 定向实验：合成器原语级 canary + 节拍器零信号定位
 * A. 直接调 stringVoice（立即时）→ 量 RMS
 * B. 直接调 tick（立即时）→ 量 RMS
 * C. 直连 master 的裸振荡器 canary → 量 RMS（排除 analyser/总线问题）
 * D. 节拍器模块播放 → 量 RMS + ctx 状态 + 采集 lastTick 实参
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;
const AB = "C:\\Users\\Administrator\\.workbuddy\\binaries\\node\\versions\\22.22.2-2\\node_modules\\agent-browser\\bin\\agent-browser.js";
const SESSION = "erhu-audio";

function ab(args, timeout = 60000) {
  return execFileSync(NODE, [AB, "--session", SESSION, ...args], {
    encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024,
  });
}
function parseAb(json) {
  let x = json;
  for (let i = 0; i < 3; i++) {
    if (typeof x === "string") { try { x = JSON.parse(x); } catch { return x; } } else break;
  }
  return x;
}

const out = { steps: [], results: {}, errors: [] };
function step(name, fn) {
  try {
    const r = fn();
    out.steps.push({ name, ok: true, brief: String(r).slice(0, 200) });
    console.log("[ok]", name);
  } catch (e) {
    out.steps.push({ name, ok: false, err: String(e && e.message || e) });
    out.errors.push(name + ": " + String(e && e.message || e));
    console.log("[FAIL]", name, String(e && e.message || e).slice(0, 300));
  }
}

// 重新加载页面（拿到干净状态），并在 DOMContentLoaded 后就位
step("open", () => ab(["open", "http://127.0.0.1:8931/?probe2=" + Date.now()], 30000));

step("setup", () => ab(["eval", String(function setup() {
  const ET = window.ET;
  const c = ET.audio.ctx();
  if (c.state === "suspended") c.resume();
  if (!window.__an) {
    const an = c.createAnalyser(); an.fftSize = 2048;
    ET.audio.master().connect(an);
    window.__an = an;
  }
  window.__probe2 = { sv: 0, tick: 0, lastTick: null, svErr: [] };
  if (!window.__wrapped2) {
    window.__wrapped2 = true;
    const _sv = ET.synth.stringVoice.bind(ET.synth);
    const _tk = ET.synth.tick.bind(ET.synth);
    ET.synth.stringVoice = function (o) { window.__probe2.sv++; try { return _sv(o); } catch (e) { window.__probe2.svErr.push(String(e && e.message || e)); } };
    ET.synth.tick = function (o) { window.__probe2.tick++; try { window.__probe2.lastTick = { t: o.t, now: ET.audio.now(), accent: o.accent, vol: o.vol, timbre: o.timbre }; } catch (e) {} try { return _tk(o); } catch (e) { window.__probe2.tickErr = (window.__probe2.tickErr || []).concat(String(e && e.message || e)); } };
  }
  return "setup ok, ctx=" + ET.audio.ctx().state;
}.toString().replace(/^function setup\(\) \{/, "(() => {").replace(/\}$/, "})()"))]));

function rmsFor(millis) {
  return ab(["eval", String(function rmsfn(ms) {
    const an = window.__an, c = window.ET.audio.ctx();
    const buf = new Float32Array(an.fftSize);
    return new Promise((res) => {
      let n = 0, peak = 0, sum = 0; const t0 = c.currentTime;
      const iv = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let p = 0, s = 0;
        for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > p) p = v; s += v * v; }
        if (p > peak) peak = p;
        sum += Math.sqrt(s / buf.length);
        if (++n >= Math.ceil(ms / 33)) {
          clearInterval(iv);
          res({ peak, avg: sum / n, ctxState: c.state, dt: c.currentTime - t0 });
        }
      }, 33);
    });
  }.toString().replace(/^function rmsfn\(ms\) \{/, "(() => {").replace(/\}$/, "})(" + millis + ")"))], 60000);
}

// A. stringVoice canary
step("canary-sv", () => {
  ab(["eval", '(() => { const ET = window.ET; ET.synth.stringVoice({ freq: 440, t: ET.audio.now() + 0.05, dur: 0.5, type: "sawtooth", vol: 0.5 }); return "scheduled@" + ET.audio.now(); })()']);
  out.results.canarySV = parseAb(rmsFor(700));
  return "done";
});

// B. tick canary
step("canary-tick", () => {
  ab(["eval", '(() => { const ET = window.ET; ET.synth.tick({ t: ET.audio.now() + 0.05, accent: true, timbre: "wood", vol: 0.7 }); return "scheduled@" + ET.audio.now(); })()']);
  out.results.canaryTick = parseAb(rmsFor(500));
  return "done";
});

// C. 裸振荡器 canary（绕过 ET.synth，直连 master）
step("canary-raw", () => {
  ab(["eval", '(() => { const ET = window.ET; const c = ET.audio.ctx(); const o = c.createOscillator(); o.frequency.value = 660; const g = c.createGain(); g.gain.value = 0.4; o.connect(g).connect(ET.audio.master()); o.start(c.currentTime + 0.05); o.stop(c.currentTime + 0.5); return "raw scheduled"; })()']);
  out.results.canaryRaw = parseAb(rmsFor(700));
  return "done";
});

// D. 节拍器模块播放
step("metro-tab", () => ab(["eval", 'document.querySelector(\'button[data-tab="metronome"]\').click(); "metro"']));
step("metro-play", () => ab(["click", "#mPlay"]));
step("sleep-metro", () => { execFileSync(NODE, ["-e", "setTimeout(()=>{},1200)"]); return "1.2s"; });
step("metro-measure", () => {
  out.results.metro = parseAb(rmsFor(3000));
  ab(["click", "#mPlay"]); // stop
  out.results.probe2 = parseAb(ab(["eval", 'JSON.stringify(window.__probe2)']));
  return "done";
});

const outFile = path.join(ROOT, "test", "_audio_probe2_result.json");
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log("WROTE", outFile);
