/* test/smoke.mjs — 资源可达性 + 核心逻辑单测（notation / jianpu / 假想调度） */
const BASE = "http://127.0.0.1:8931/";
const files = [
  "index.html", "sw.js",
  "css/base.css", "css/layout.css", "css/metronome.css", "css/tuner.css", "css/ear.css", "css/score.css",
  "js/core/notation.js", "js/core/audio.js", "js/core/synth.js", "js/core/pitch.js", "js/core/store.js", "js/core/jianpu.js",
  "js/data/tunings.js", "js/data/scores.js", "js/data/exercises.js",
  "js/modules/metronome.js", "js/modules/tuner.js", "js/modules/ear.js", "js/modules/score.js", "js/app.js",
];
let bad = 0;
for (const f of files) {
  const res = await fetch(BASE + f);
  if (res.status !== 200) { console.log("FAIL", res.status, f); bad++; }
}
console.log(bad === 0 ? `资源检查：全部 ${files.length} 个 200 OK` : `资源检查：${bad} 个失败`);

// ---- 在 Node 里模拟浏览器全局，加载 core 脚本 ----
const window = globalThis;
window.ET = {};
global.window = window;
Object.defineProperty(global, "navigator", { value: { mediaDevices: null }, configurable: true }); // pitch.js 引用但不启动
const fs = await import("node:fs");
const load = (p) => { new Function("window", fs.readFileSync(p, "utf8"))(window); };
for (const p of ["js/core/notation.js", "js/core/jianpu.js"]) load(p);

const ET = window.ET;
const assert = (name, cond, extra) => {
  if (cond) console.log("PASS", name);
  else { console.log("FAIL", name, extra ?? ""); bad++; }
};

// notation
assert("A4=440Hz", Math.abs(ET.notation.noteToFreq("A4") - 440) < 1e-9);
assert("D4 midi=62", ET.notation.noteToMidi("D4") === 62);
assert("midi->note 往返", ET.notation.midiToNote(69) === "A4");
assert("D调 1=D4", ET.notation.degToMidi("1", 0, "D") === 62);
assert("D调 5=A4", ET.notation.degToMidi("5", 0, "D") === 69);
assert("D调 1'=D5", ET.notation.degToMidi("1", 1, "D") === 74);
assert("G调 5,=D4", ET.notation.degToMidi("5", -1, "G") === 62);
assert("F调 6,=D4", ET.notation.degToMidi("6", -1, "F") === 62);
const c100 = ET.notation.centsBetween(440, 415.3);
assert("音分差 半音≈+100", c100 > 95 && c100 < 105, "实际 " + c100);
const near = ET.notation.freqToNearest(442, 440);
assert("freqToNearest A4 +8", near.name === "A4" && near.cents === 8, JSON.stringify(near));

// jianpu: 小星星
const xx = ET.jianpu.parse({
  text: "1[空拉] 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - |",
  key: "D", meter: "4/4",
});
assert("小星星 4 小节", xx.bars.length === 4);
assert("小星星 音数", xx.notes.length === 14);
assert("首音 弓=拉 指=空 弦=内", xx.notes[0].b === "拉" && xx.notes[0].f === "空" && xx.notes[0].s === "内");
assert("自动交替 第2音推", xx.notes[1].b === "推");
assert("第3音(外弦空)弦=外", xx.notes[2].s === "外" && xx.notes[2].f === "空");
assert("6=外弦一指", xx.notes[4].p === "B4" && xx.notes[4].f === "一");
assert("增时线 5- = 2拍", xx.notes[6].d === "5" && xx.notes[6].dur === 2, "实际 dur=" + (xx.notes[6] && xx.notes[6].dur));
assert("小节2共4拍", xx.bars[1].reduce((a, n) => a + n.dur, 0) === 4);

// 欢乐颂：附点 + 减时线
const hl = ET.jianpu.parse({ text: "3. 2/2 2 - |", key: "D", meter: "4/4" });
assert("附点 1.5 拍", hl.notes[0].dur === 1.5);
assert("八分 0.5 拍", hl.notes[1].dur === 0.5);
assert("欢乐颂小节 4 拍", hl.bars[0].reduce((a, n) => a + n.dur, 0) === 4);

// 连弓：slur 标志与弓向分离
const lg = ET.jianpu.parse({ text: "3[拉] 3[连] 4 5[推] |", key: "D", meter: "4/4" });
assert("连弓延续同弓向", lg.notes[1].b === "拉" && lg.notes[1].slur === true && lg.notes[2].slur === true);
assert("显式推重置", lg.notes[3].b === "推" && lg.notes[3].slur === false);

// 按调查表：G 调外弦二指 = C5、F 调内弦二指 = F4
const tg = ET.jianpu.buildTable("G");
assert("G调 外二=C5", tg[72] && tg[72].s === "外" && tg[72].f === "二", JSON.stringify(tg[72]));
assert("G调 内三=G4", tg[67] && tg[67].s === "内" && tg[67].f === "三");
const tf = ET.jianpu.buildTable("F");
assert("F调 内二=F4", tf[65] && tf[65].s === "内" && tf[65].f === "二");
assert("F调 外一=Bb4", tf[70] && tf[70].s === "外" && tf[70].f === "一");

// 全部曲目/练习解析不抛错 + 每小节拍数正确
const fs2 = await import("node:fs");
const evalData = (p) => { new Function("window", fs2.readFileSync(p, "utf8"))(window); };
evalData("js/data/scores.js"); evalData("js/data/exercises.js");
for (const s of [...ET.scores, ...ET.exercises]) {
  let ok = true, msg = "";
  try {
    const r = ET.jianpu.parse(s);
    const beatUnit = r.den === 8 ? 0.5 : 1;
    const badBar = r.bars.findIndex((b) => Math.abs(b.reduce((a, n) => a + n.dur, 0) - r.num * beatUnit) > 1e-9);
    if (badBar >= 0) { ok = false; msg = `第 ${badBar + 1} 小节拍数错误`; }
    const noPitch = r.notes.find((n) => !n.rest && !n.p);
    if (noPitch) { ok = false; msg = `第 ${noPitch.bar} 小节有音高未解析`; }
    const noFinger = r.notes.find((n) => !n.rest && !n.f);
    if (noFinger) { ok = false; msg = `第 ${noFinger.bar} 小节「${noFinger.p}」无指法（超一把位音域？）`; }
  } catch (e) { ok = false; msg = e.message; }
  assert(`谱面: ${s.title}`, ok, msg);
}

console.log(bad === 0 ? "\n全部单测通过" : `\n${bad} 项失败`);
process.exit(bad === 0 ? 0 : 1);
