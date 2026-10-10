/* test/dom-goal.mjs — 针对「训练目标行 + 练完进入按钮」的定向 jsdom 断言（一次性探针） */
import { JSDOM, VirtualConsole } from "file:///C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js";

let bad = 0;
const assert = (name, cond, extra) => {
  if (cond) console.log("PASS", name);
  else { console.log("FAIL", name, extra ?? ""); bad++; }
};
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(String(e.message || e)));
vc.on("error", (...a) => errors.push(a.map(String).join(" ")));

function makeParam(v) {
  return { value: v ?? 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
}
class FakeNode { connect() { return this; } start() {} stop() {} }
class FakeAC {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = "running"; this.destination = new FakeNode(); }
  resume() { return Promise.resolve(); }
  createGain() { const n = new FakeNode(); n.gain = makeParam(1); return n; }
  createOscillator() { const n = new FakeNode(); n.type = ""; n.frequency = makeParam(440); return n; }
  createBiquadFilter() { const n = new FakeNode(); n.type = ""; n.frequency = makeParam(2400); n.Q = makeParam(1); return n; }
  createDynamicsCompressor() {
    const n = new FakeNode();
    n.threshold = makeParam(-24); n.knee = makeParam(30); n.ratio = makeParam(12);
    n.attack = makeParam(0.003); n.release = makeParam(0.25); return n;
  }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { const n = new FakeNode(); n.buffer = null; return n; }
  createAnalyser() { return { fftSize: 2048, getFloatTimeDomainData() {} }; }
  createMediaStreamSource() { return new FakeNode(); }
}

const dom = await JSDOM.fromFile(new URL("../index.html", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), {
  runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(window) { window.AudioContext = FakeAC; window.HTMLMediaElement.prototype.play = () => {}; },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1800);
const w = dom.window, d = w.document;
const $$ = (s) => [...d.querySelectorAll(s)];

// 展开每日基本功，选「换把练习」
const head = $$("h3, .score-group-head, #scItems > *").find((n) => n.textContent.includes("每日基本功"));
const drillHead = $$("#scItems .score-group-head").find((h) => h.textContent.includes("每日基本功"));
if (drillHead && drillHead.classList.contains("collapsed")) drillHead.click();
await sleep(60);
const hb = $$("#scItems .list-item").find((i) => i.textContent.includes("换把练习"));
assert("列表可定位换把练习", !!hb);
hb.click();
await sleep(60);
const goal = d.querySelector("#scGoal");
assert("训练目标行可见", !!goal && !goal.hidden, goal && goal.hidden);
assert("目标行含训练目标文案", goal && goal.textContent.includes("训练目标"), goal && goal.textContent.slice(0, 40));
const nextBtn = goal && [...goal.querySelectorAll("button")].find((b) => b.textContent.includes("练完进入"));
assert("出现「练完进入」按钮指向菊花台", !!nextBtn && nextBtn.textContent.includes("菊花台"), nextBtn && nextBtn.textContent);
nextBtn.click();
await sleep(60);
assert("点击后跳到菊花台", d.querySelector("#scTitle").textContent === "菊花台", d.querySelector("#scTitle").textContent);
assert("菊花台无 next 时目标行仍显示 desc 但无跳转按钮", !d.querySelector("#scGoal").hidden && ![...d.querySelector("#scGoal").querySelectorAll("button")].some((b) => b.textContent.includes("练完进入")));
// G大调一把位练习 → 沧海一声笑
const gItem = $$("#scItems .list-item").find((i) => i.textContent.includes("G大调一把位练习"));
gItem.click(); await sleep(60);
assert("G大调练习目标行指向沧海一声笑", [...d.querySelector("#scGoal").querySelectorAll("button")].some((b) => b.textContent.includes("沧海一声笑")));
// 入门曲（小星星）无 desc/next → 目标行隐藏
const basicHead2 = $$("#scItems .score-group-head").find((h) => h.textContent.includes("入门曲目"));
if (basicHead2 && basicHead2.classList.contains("collapsed")) basicHead2.click();
await sleep(60);
const xx = $$("#scItems .list-item").find((i) => i.textContent.includes("小星星"));
xx.click(); await sleep(60);
assert("小星星显示 desc 但无跳转按钮", !d.querySelector("#scGoal").hidden && d.querySelector("#scGoal").textContent.includes("五声音阶") && ![...d.querySelector("#scGoal").querySelectorAll("button")].some((b) => b.textContent.includes("练完进入")));
assert("无页面运行时错误", errors.length === 0, errors.join(" | ").slice(0, 200));
console.log(bad === 0 ? "\n目标行探针全部通过" : `\n${bad} 项失败`);
process.exit(bad === 0 ? 0 : 1);
