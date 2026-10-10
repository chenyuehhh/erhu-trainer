/* sw.js — 离线缓存（K-05 修订版）
 * ------------------------------------------------------------------------
 * 修订背景
 *   v5 及更早版本对所有请求（含 index.html 自身）一律 cache-first，
 *   结果：每次进入站点先拿到缓存里的旧 HTML，必须手动刷新才看得到新页面。
 *
 * 现行策略
 *   · HTML / 导航  → network-first：每次都向服务器要最新 HTML，
 *                    3s 超时或断网才回落到缓存（离线仍然可用）
 *   · CSS / JS     → stale-while-revalidate：命中先返回保证秒开，
 *                    同时后台拉取新版入缓存
 *
 * 配合 tools/bump-version.mjs：发布前重新给 CSS/JS 打内容 hash 版本号。
 *   资源 URL 变了 → 旧的带 ?v= 的缓存条目不会再被引用，
 *   用户第一次进入就拿到新代码（不再是"第二次才生效"）。
 * ------------------------------------------------------------------------ */
const VERSION = "erhu-trainer-v6"; // 缓存桶名。仅在需要强制全网清缓存时才改这里
const OFFLINE_URL = "index.html";
const NET_TIMEOUT = 3000;

const ASSETS = [
  "./",
  "index.html",
  "css/base.css",
  "css/themes.css",
  "css/layout.css",
  "css/metronome.css",
  "css/tuner.css",
  "css/ear.css",
  "css/score.css",
  "js/core/notation.js",
  "js/core/audio.js",
  "js/core/wakelock.js",
  "js/core/synth.js",
  "js/core/pitch.js",
  "js/core/store.js",
  "js/core/jianpu.js",
  "js/data/tunings.js",
  "js/data/scores.js",
  "js/data/exercises.js",
  "js/modules/metronome.js",
  "js/modules/tuner.js",
  "js/modules/ear.js",
  "js/modules/score.js",
  "js/app.js",
];

/* 摘取 index.html 当前引用的资源清单：用来清理历史版本残留的缓存条目 */
async function currentAssetPaths() {
  try {
    const res = await fetch(OFFLINE_URL, { cache: "reload" });
    const text = await res.text();
    const paths = new Set([location.pathname, new URL(OFFLINE_URL, location.href).pathname]);
    for (const m of text.matchAll(/(?:href|src)="((?:css|js)\/[^"]+)"/g)) {
      paths.add(new URL(m[1], location.href).pathname);
    }
    return paths;
  } catch {
    return null; // 取不到清单就不清理，避免离线时把缓存删空
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // 1) 删掉其他版本号的整个缓存桶
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      // 2) 清理本桶里已经不再被 index.html 引用的旧 ?v= 条目
      const paths = await currentAssetPaths();
      if (paths) {
        const cache = await caches.open(VERSION);
        const entries = await cache.keys();
        await Promise.all(
          entries.filter((req) => !paths.has(new URL(req.url).pathname)).map((req) => cache.delete(req))
        );
      }
      await self.clients.claim();
    })()
  );
});

const isHTMLRequest = (req, url) =>
  req.mode === "navigate" ||
  (req.headers.get("accept") || "").includes("text/html") ||
  url.pathname.endsWith("/") ||
  url.pathname.endsWith(".html");

/* HTML：网络优先，保证永远是服务器上最新的那份 */
async function networkFirst(req) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT);
  try {
    const res = await fetch(req, { cache: "reload", signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch {
    clearTimeout(timer);
    const hit = (await caches.match(req, { ignoreSearch: true })) || (await caches.match(OFFLINE_URL));
    if (hit) return hit;
    return new Response("离线且无可用缓存", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/* CSS/JS：陈旧内容先返回（秒开），后台校验更新 */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  if (hit) return hit;
  const res = await net;
  if (res) return res;
  return (
    (await caches.match(req, { ignoreSearch: true })) ||
    new Response("", { status: 504, statusText: "offline" })
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(isHTMLRequest(req, url) ? networkFirst(req) : staleWhileRevalidate(req));
});
