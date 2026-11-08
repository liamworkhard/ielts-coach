/* 词光 · 雅思词汇诊断 —— 离线缓存
 * 改动代码后请把下面的 VERSION 加一，浏览器会自动更新。 */

const VERSION = "v4";
const APP_CACHE = `app-${VERSION}`;
const MEDIA_CACHE = "media-v1"; // 媒体缓存独立于版本，升级不会清空已下载的插画录音
const MAX_MEDIA = 800;

const APP_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "manifest.json",
  "js/app.js",
  "js/data.js",
  "js/store.js",
  "js/test.js",
  "js/study.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "data/words.json", // 7.7MB 词库，装机后离线可用
];

const isMedia = (url) => url.hostname === "0xlei.tech";

/* ---------- 安装：把应用外壳和词库装进缓存 ---------- */

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      await Promise.all(
        APP_ASSETS.map((u) =>
          cache.add(new Request(u, { cache: "reload" })).catch(() => null)
        )
      );
      await self.skipWaiting();
    })()
  );
});

/* ---------- 激活：清掉旧版本缓存 ---------- */

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([APP_CACHE, MEDIA_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

/* ---------- 取资源 ---------- */

async function cacheFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && res.status === 200) {
      cache.put(request, res.clone()).catch(() => null);
      return res;
    }
    // 代理或服务器返回 5xx 时，宁可给出已缓存的副本
    if (res && res.status >= 500) {
      const fallback = await cache.match(request, { ignoreSearch: true });
      if (fallback) return fallback;
    }
    return res;
  } catch (err) {
    const fallback =
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match("index.html")) ||
      (await cache.match("./"));
    if (fallback) return fallback;
    throw err;
  }
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  const excess = keys.length - max;
  await Promise.all(keys.slice(0, excess).map((k) => cache.delete(k)));
}

async function mediaFirst(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    // 插画/录音是 no-cors 请求，响应为 opaque，同样可以缓存
    const cacheable = res && (res.status === 200 || res.type === "opaque");
    if (cacheable) {
      await trimCache(cache, MAX_MEDIA);
      cache.put(request, res.clone()).catch(() => null);
    }
    return res;
  } catch (err) {
    const fallback = await cache.match(request);
    if (fallback) return fallback;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    // 词光的插画与录音：缓存优先，离线也能看图听音
    if (isMedia(url)) event.respondWith(mediaFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const fallback = async () =>
          (await caches.match("index.html")) || (await caches.match("./")) || null;
        try {
          const res = await fetch(request);
          if (res && res.status === 200) {
            const cache = await caches.open(APP_CACHE);
            cache.put("index.html", res.clone()).catch(() => null);
            return res;
          }
          return (await fallback()) || res;
        } catch {
          return (await fallback()) || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(cacheFirst(request));
});
