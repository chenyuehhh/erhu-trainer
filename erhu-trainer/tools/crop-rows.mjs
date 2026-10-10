/* tools/crop-rows.mjs — 把谱面 PNG 按行裁切并放大，便于逐行核读 */
import path from "node:path";
import url from "node:url";
import { createRequire } from "node:module";
const require2 = createRequire("C:/Users/Administrator/.workbuddy/binaries/node/workspace/package.json");
const sharp = require2("sharp");

const SRC = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "score-img-liutianhua");
const file = process.argv[2];
const bands = process.argv.slice(3).map((s) => s.split("-").map(Number)); // 如 0.22-0.36
const inp = path.join(SRC, file);
const meta = await sharp(inp).metadata();
console.log("src", meta.width, "x", meta.height);
let i = 0;
for (const [a, b] of bands) {
  const top = Math.round(meta.height * a);
  const h = Math.round(meta.height * (b - a));
  const out = inp.replace(/\.png$/, `.row${++i}.png`);
  await sharp(inp)
    .extract({ left: 0, top, width: meta.width, height: h })
    .resize({ width: Math.min(2200, Math.round(meta.width * 1.6)) })
    .png()
    .toFile(out);
  console.log("row", i, "y", top, "h", h, "->", path.basename(out));
}
