/* tools/verify-shift.mjs — 临时验证：换把检测（verify 后可删） */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const win = globalThis;
win.ET = {};
global.window = win;
Object.defineProperty(global, "navigator", { value: { mediaDevices: null }, configurable: true });
const load = (p) => { new Function("window", fs.readFileSync(path.join(ROOT, p), "utf8"))(win); };
for (const p of ["js/core/notation.js", "js/core/jianpu.js", "js/data/scores.js", "js/data/exercises.js"]) load(p);
const ET = win.ET;

// 与 score.js 保持一致的 notePos / attachShifts
function notePos(n) {
  if (n.f) {
    const mm = n.f.match(/([一二三四五六七])把/);
    if (mm) return { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7 }[mm[1]];
  }
  if (!n.s) return null;
  if (n.f && ["空", "一", "二", "三", "四"].includes(n.f)) return 1;
  const ceiling = n.s === "内" ? 67 : 76;
  if (n.midi != null && n.midi > ceiling) return 2;
  return 1;
}
function attachShifts(parsed) {
  let prev = null;
  parsed.notes.forEach((n) => {
    if (n.rest) { n.shift = null; return; }
    const p = notePos(n);
    if (p == null) { n.shift = null; return; }
    n.shift = prev != null && p !== prev ? { isShift: true, fromPos: prev, toPos: p } : null;
    prev = p;
  });
  return parsed;
}

let bad = 0;
for (const s of [...ET.scores, ...ET.exercises]) {
  const p = attachShifts(ET.jianpu.parse(s));
  const hits = p.notes.filter((n) => n.shift);
  const detail = hits.map((n) => `第${n.bar}小节 ${n.d}${n.oct > 0 ? "'" : n.oct < 0 ? "," : ""}(${n.p}) ${n.shift.fromPos}→${n.shift.toPos}把`).join("、");
  if (s.title === "菊花台") {
    // 预期 4 处：两处上行进二把（3'[二把三]），两处回落一把（其后首个 2'）
    const ok = hits.length === 4
      && hits.every((n) => [1, 2].includes(n.shift.fromPos) && [1, 2].includes(n.shift.toPos) && n.shift.fromPos !== n.shift.toPos)
      && hits.filter((n) => n.shift.toPos === 2).length === 2
      && hits.filter((n) => n.shift.toPos === 2).every((n) => n.f === "二把三" && n.midi === 78);
    console.log(ok ? "PASS" : "FAIL", `${s.title}: ${hits.length} 处换把 ${detail}`);
    if (!ok) bad++;
  } else if (hits.length !== 0) {
    console.log("FAIL", `${s.title}: 意外检出 ${hits.length} 处 ${detail}`);
    bad++;
  } else {
    console.log("PASS", `${s.title}: 无换把（一把位）`);
  }
}
console.log(bad === 0 ? "\n换把检测验证全部通过" : `\n${bad} 项失败`);
process.exit(bad === 0 ? 0 : 1);
