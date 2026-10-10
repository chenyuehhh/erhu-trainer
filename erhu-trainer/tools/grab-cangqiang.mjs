/* tools/grab-cangqiang.mjs — 抓苍强曲谱的 notation 文本数据 */
import fs from "node:fs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const url = process.argv[2];
const out = process.argv[3];
const r = await fetch(url, { headers: { "User-Agent": UA } });
const t = await r.text();
// 找 {bpm:N} 开头的曲谱串（页面 JS 内嵌）
const m = t.match(/\{bpm:\s*\d+\}[\s\S]{0,4000}?(?=["']\s*[,;)]|<\/script>)/i);
if (!m) { console.log("NOT FOUND"); process.exit(1); }
const raw = m[0];
fs.writeFileSync(out, raw, "utf8");
console.log("saved", out, raw.length, "chars");
console.log(raw.slice(0, 600));
