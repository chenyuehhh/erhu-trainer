/* tools/verify-lyric.mjs — 歌词段（measures）体检：句→小节映射 + 逐句拍数
 *
 * 用法（项目根目录）：
 *   node tools/verify-lyric.mjs            体检全部曲目
 *   node tools/verify-lyric.mjs 小星星      只看某一首（按标题子串匹配）
 *
 * 它回答三件事：
 *   1. measures 各句 notes 的小节数加起来是否等于全曲小节数
 *      （不等 → 练习句/歌词高亮整体错位，尾部还会多出兜底句）
 *   2. 每句 notes 逐小节拍数是否与拍号一致（4/4 每小节 4 拍）
 *      （句子 notes 与全曲 text 不同步时会在这里暴露）
 *   3. 每句是否有歌词文本（无词句列出，提示还欠歌词）
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
let checked = 0;

for (const [groupName, list] of groups) {
  for (const s of list) {
    if (filter && !s.title.includes(filter)) continue;
    if (!s.measures || !s.measures.length) continue;
    checked++;
    const problems = [];

    // 1) 句→小节映射：句子小节数求和 vs 全曲小节数
    const counts = s.measures.map((m) =>
      String(m.notes || "").split("|").map((x) => x.trim()).filter(Boolean).length
    );
    const sumBars = counts.reduce((a, b) => a + b, 0);
    const totalBars = ET.jianpu.parse(s).bars.length;
    if (sumBars !== totalBars) {
      problems.push(`  句小节数合计 ${sumBars} ≠ 全曲 ${totalBars} 小节（映射会整体偏移）`);
    }

    // 2) 每句逐小节拍数（句子 notes 单独 parse，拍号一致才可比）
    s.measures.forEach((m, i) => {
      try {
        const r = ET.jianpu.parse({ text: m.notes, key: s.key, meter: s.meter });
        const unit = r.den === 8 ? 0.5 : 1;
        const target = r.num * unit;
        const badBar = r.bars.findIndex((b) => Math.abs(b.reduce((a, n) => a + n.dur, 0) - target) > 1e-9);
        if (badBar >= 0) {
          problems.push(`  第 ${i + 1} 句「${m.lyric || "（无词）"}」第 ${badBar + 1} 小节拍数错误（应为 ${target} 拍）`);
        }
        if (r.bars.length !== counts[i]) {
          problems.push(`  第 ${i + 1} 句 notes 解析出 ${r.bars.length} 小节，与计数 ${counts[i]} 不一致`);
        }
      } catch (e) {
        problems.push(`  第 ${i + 1} 句 notes 解析失败：${e.message}`);
      }
    });

    // 3) 无词句提示
    const noLyric = s.measures
      .map((m, i) => (String(m.lyric || "").trim() ? null : i + 1))
      .filter(Boolean);
    if (noLyric.length) problems.push(`  第 ${noLyric.join("、")} 句无歌词文本`);

    if (problems.length) {
      badTotal++;
      console.log(`\n【${groupName}｜${s.title}】${s.measures.length} 句`);
      problems.forEach((p) => console.log(p));
    }
  }
}

console.log(
  checked === 0
    ? "没有曲目带 measures 歌词段"
    : badTotal === 0
      ? `\n${checked} 首带歌词段曲目全部通过`
      : `\n${badTotal}/${checked} 首歌词段需要修`
);
process.exit(0);
