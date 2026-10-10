/* test/probe.mjs — 以 <script> 注入方式逐脚本排查 ET.* 挂载（真实执行上下文） */
import { JSDOM, VirtualConsole } from "file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js";
import fs from "node:fs";

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.detail && e.detail.message ? e.detail.message : e.message || e)));
vc.on("error", (...a) => errors.push("console.error: " + a.map(String).join(" ")));

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://127.0.0.1:8931/",
  pretendToBeVisual: true,
  runScripts: "dangerously",
  virtualConsole: vc,
});
const w = dom.window, d = w.document;
w.AudioContext = class { constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = "running"; this.destination = {}; } resume() { return Promise.resolve(); } };

const files = [
  "js/core/notation.js", "js/core/audio.js", "js/core/synth.js", "js/core/pitch.js",
  "js/core/store.js", "js/core/jianpu.js",
  "js/data/tunings.js", "js/data/scores.js", "js/data/exercises.js",
  "js/modules/metronome.js", "js/modules/tuner.js", "js/modules/ear.js", "js/modules/score.js",
  "js/app.js",
];
for (const f of files) {
  const before = JSON.stringify(Object.keys(w.ET || {}));
  const code = fs.readFileSync(f, "utf8");
  const s = d.createElement("script");
  s.textContent = code;
  d.body.appendChild(s);
  const after = JSON.stringify(Object.keys(w.ET || {}));
  console.log((before === after && !w.ET ? "SAME" : "ADDED"), f, after);
}
console.log("---- errors ----");
errors.forEach((e) => console.log(e));
