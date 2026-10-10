/* tools/dl-one.mjs — 单图下载（带站点 Referer） */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
const OUT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "score-img-liutianhua");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const [name, u, referer] = process.argv.slice(2);
const r = await fetch(u, { headers: { "User-Agent": UA, Referer: referer || u } });
if (!r.ok) { console.log("FAIL", r.status); process.exit(1); }
const buf = Buffer.from(await r.arrayBuffer());
const ext = buf.slice(0, 6).toString("latin1").startsWith("GIF8") ? ".gif" : buf[0] === 0xFF ? ".jpg" : ".png";
fs.writeFileSync(path.join(OUT, name + ext), buf);
console.log("OK", name + ext, buf.length);
