// Service worker：network-first，离线兜底
// 版本号在 install 时从 /BUILD_ID 动态读取，每次部署 BUILD_ID 变化 → 旧缓存自动失效
const FALLBACK_VERSION = "v1";

async function resolveVersion() {
  try {
    const res = await fetch("/BUILD_ID", { cache: "no-store" });
    if (res.ok) {
      const id = (await res.text()).trim();
      if (id) return `rgo-${id}`;
    }
  } catch {
    // 首次离线安装时拿不到 BUILD_ID，退回固定版本
  }
  return `rgo-${FALLBACK_VERSION}`;
}

let CACHE_NAME = null;

const CACHE_URLS = [
  "/",
  "/chat",
  "/resume/list",
  "/applications",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      CACHE_NAME = await resolveVersion();
      const cache = await caches.open(CACHE_NAME);
      // 单个资源失败不阻塞安装
      await Promise.allSettled(
        CACHE_URLS.map((url) => cache.add(url).catch(() => null)),
      );
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const current = CACHE_NAME ?? (await resolveVersion());
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== current).map((k) => caches.delete(k)),
      );
      self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith("http")) return;

  const isNavigation = event.request.mode === "navigate";
  const isStatic = /\.(js|css|svg|png|woff2)$/.test(
    new URL(event.request.url).pathname,
  );

  if (!isNavigation && !isStatic) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME ?? (await resolveVersion()));
      try {
        // network-first：优先请求网络，确保拿到最新内容
        const fetched = await fetch(event.request);
        if (fetched && fetched.ok) {
          cache.put(event.request, fetched.clone());
        }
        return fetched;
      } catch (err) {
        // 离线兜底：回退缓存
        const cached = await cache.match(event.request);
        if (cached) return cached;
        if (isNavigation) {
          const home = await cache.match("/");
          if (home) return home;
        }
        throw err;
      }
    })(),
  );
});
