/* tools/check-score.mjs — 谱面体检：逐小节核对拍数，列出超一把位的音
 *
 * 用法（项目根目录）：
 *   node tools/check-score.mjs            只看有问题的曲目
 *   node tools/check-score.mjs 兰亭序      只看某一首（按标题子串匹配）
 *
 * 它回答两件事：
 *   1. 每小节是否正好装满 num 拍（4/4 就是 4 拍）—— 差几拍会直接标出来
 *   2. 有没有超出一把位音域、自动指法填充不了的音（需要显式标换把指法）
 */
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

const filter = process.argv[2] || "";
const groups = [["入门曲目", ET.scores], ["每日基本功", ET.exercises]];
let badTotal = 0;

for (const [groupName, list] of groups) {
  const hits = [];
  for (const s of list) {
    if (filter && !s.title.includes(filter)) continue;
    const r = ET.jianpu.parse(s);
    const unit = r.den === 8 ? 0.5 : 1;
    const target = r.num * unit;

    const badBars = [];
    r.bars.forEach((b, i) => {
      const sum = b.reduce((a, n) => a + n.dur, 0);
      if (Math.abs(sum - target) > 1e-9) {
        const diff = +(sum - target).toFixed(2);
        badBars.push(`  第 ${String(i + 1).padStart(2)} 小节  ${String(sum).padStart(4)}/${target} 拍  ${diff > 0 ? "多" : "缺"} ${Math.abs(diff)} 拍   [${b.map((n) => n.d + (n.rest ? "" : "")).join(" ")}]`);
      }
    });

    const noFinger = [...new Set(r.notes.filter((n) => !n.rest && !n.f).map((n) => `第${n.bar}小节 ${n.p}`))];
    if (badBars.length || noFinger.length) {
      badTotal++;
      hits.push(`\n【${groupName}｜${s.title}】${s.key}调 ${s.meter} 共 ${r.bars.length} 小节 歌词段 ${(s.measures || []).filter((m) => String(m.lyric || "").trim()).length}`);
      if (badBars.length) {
        hits.push(`  拍数异常 ${badBars.length}/${r.bars.length} 小节：`);
        for (const line of badBars) hits.push(line);
      }
      if (noFinger.length) hits.push(`  ⚠ 超一把位、无自动指法：${noFinger.join("、")}`);
    }
  }
  if (hits.length) { console.log(hits.join("\n")); }
}

const allCount = ET.scores.length + ET.exercises.length;
console.log(badTotal === 0 ? `\n全部 ${allCount} 首谱面体检通过` : `\n${badTotal} 首需要修（共体检 ${allCount} 首）`);
process.exit(0);
