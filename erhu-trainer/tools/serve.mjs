/* tools/serve.mjs — 本地静态服务器（仅开发/测试用，不参与线上运行）
 *
 * 为什么自带一个：发布流程的第 3 步要在 http://127.0.0.1:8931 跑 test/smoke.mjs
 * 和 test/dom.mjs，本机未必装了 python 或 serve，零依赖才能保证每次都起得来。
 *
 * 用法：
 *   node tools/serve.mjs          # 默认 127.0.0.1:8931
 *   PORT=8080 node tools/serve.mjs
 *
 * 所有响应带 Cache-Control: no-store —— 本地调试时不要被浏览器/SW 缓存干扰，
 * 否则改完代码刷新看不到效果，会误判成发布问题。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8931);
const HOST = process.env.HOST || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

const server = http.createServer((req, res) => {
  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Bad Request");
    return;
  }
  let file = path.join(ROOT, pathname);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 " + pathname);
    console.log("404", pathname);
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`serving ${ROOT} at http://${HOST}:${PORT}/`);
});
