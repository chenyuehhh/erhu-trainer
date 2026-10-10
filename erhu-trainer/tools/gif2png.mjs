/* tools/gif2png.mjs — 把谱面 GIF 转 PNG 并 2x 放大（sharp），便于读谱转写 */
import path from "node:path";
import url from "node:url";
import { createRequire } from "node:module";
// sharp 装在托管 node workspace，从那里解析
const require2 = createRequire("C:/Users/Administrator/.workbuddy/binaries/node/workspace/package.json");
const sharp = require2("sharp");

const SRC = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "score-img-liutianhua");
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["d-diaoyibawei.gif", "huanba.gif"];
for (const f of files) {
  const inp = path.join(SRC, f);
  const out = inp.replace(/\.gif$/i, ".png");
  const meta = await sharp(inp, { animated: false, failOn: "none" }).metadata();
  const img = sharp(inp, { failOn: "none" }).resize({ width: meta.width * 2, kernel: "lanczos3" });
  await img.png({ compressionLevel: 9 }).toFile(out);
  console.log("OK", f, meta.width + "x" + meta.height, "->", path.basename(out));
}
