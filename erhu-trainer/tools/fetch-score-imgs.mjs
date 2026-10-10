/* tools/fetch-score-imgs.mjs — 抓 sojianpu/92kk 谱面图片 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const OUT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "score-img-liutianhua");
fs.mkdirSync(OUT, { recursive: true });
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";

async function getHtml(u) {
  const r = await fetch(u, { headers: { "User-Agent": UA, Referer: u } });
  return r.ok ? await r.text() : null;
}

function extractAllImgUrls(html, base) {
  const set = new Set();
  const re = /(?:src|data-src|data-original|data-lazy-src)\s*=\s*["']([^"']+\.(?:gif|jpe?g|png|webp)[^"']*)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    let u = m[1];
    if (u.startsWith("//")) u = "https:" + u;
    else if (!/^https?:/i.test(u)) u = new URL(u, base).href;
    set.add(u);
  }
  return [...set];
}

async function dl(name, u, referer) {
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA, Referer: referer || u } });
    if (!r.ok) { console.log("DL FAIL", name, r.status, u); return false; }
    const buf = Buffer.from(await r.arrayBuffer());
    const ext = buf.slice(0, 6).toString("latin1").startsWith("GIF8") ? ".gif" : buf[0] === 0xFF ? ".jpg" : ".png";
    fs.writeFileSync(path.join(OUT, name + ext), buf);
    console.log("DL OK", name + ext, buf.length, u);
    return true;
  } catch (e) { console.log("DL ERR", name, String(e).slice(0, 100)); return false; }
}

const jobs = [
  // 直接已知的 92kk 图
  ["g-gdyibawei", "https://imgs.92kk.com/attachment/jianpu/jianpu/2024/202405/20240530/2024053014/202405301451/000705305101_375106.jpg"],
];
for (const [n, u] of jobs) await dl(n, u);

// 从 sojianpu 页面继续挖：换把练习 + 尝试 D大调一把位练习的可能 slug
const pages = [
  ["huanba", "http://www.sojianpu.com/jianpu/hblxzgehkjgdyzqej.html"],
];
for (const [name, u] of pages) {
  const html = await getHtml(u);
  if (!html) { console.log(name, "HTML FAIL"); continue; }
  const imgs = extractAllImgUrls(html, u).filter((x) => /imgs\.92kk|attachment|uploads|allimg/i.test(x));
  console.log(name, "imgs:", imgs.join(" | ") || "(none)");
  let i = 0;
  for (const iu of imgs) await dl(name + "-" + ++i, iu, u);
}
