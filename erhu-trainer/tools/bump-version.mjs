/* tools/bump-version.mjs — 发布前跑一次：给 CSS/JS 打内容 hash 版本号
 *
 * 为什么需要它
 *   Service Worker 对 CSS/JS 用 stale-while-revalidate（命中先用，后台更新）。
 *   如果资源 URL 保持不变，用户第一次进来拿到的仍是缓存里的旧代码。
 *   给 URL 加上内容 hash 后：文件内容一变 → URL 变 → 必然走网络拿新版本。
 *   没改动的文件 hash 不变 → 继续吃缓存，不浪费。
 *
 * 用法
 *   node tools/bump-version.mjs
 *   （无输出说明所有资源版本都是最新的；有输出会列出哪些文件被刷新）
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(ROOT, "index.html");

const RE = /(href|src)="((?:css|js)\/[^"?]+)(?:\?v=[^"]*)?"/g;

let html = fs.readFileSync(INDEX, "utf8");
const touched = [];

html = html.replace(RE, (match, attr, file) => {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    console.log("WARN 引用了不存在的文件，已跳过:", file);
    return match;
  }
  const hash = crypto.createHash("md5").update(fs.readFileSync(abs)).digest("hex").slice(0, 8);
  const next = `${attr}="${file}?v=${hash}"`;
  if (next !== match) touched.push(file);
  return next;
});

fs.writeFileSync(INDEX, html, "utf8");

if (touched.length === 0) {
  console.log("版本号无变化：所有 CSS/JS 内容与上一版一致");
} else {
  console.log(`已刷新 ${touched.length} 个资源的版本号:`);
  for (const f of touched) console.log("  " + f);
}
