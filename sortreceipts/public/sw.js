// 静态图片走缓存优先，换了文件也不会自动失效。
// 所以凡是 public/ 下的图片有改动，这里必须抬一个版本号，
// 激活时会把旧缓存整批删掉。
const CACHE_NAME = "piaoxiaozhu-v4";
const PRECACHE_URLS = ["/", "/auth/login", "/toolkit", "/upload", "/result"];

// 离线回退页面（缓存中没有匹配时的兜底）
const FALLBACK_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // 只缓存 GET 请求
  if (request.method !== "GET") return;

  // 只处理本站的 http(s) 请求。浏览器插件发起的 chrome-extension:// 请求
  // 也会进到这里，Cache API 不接受这种 URL，直接放行避免报 TypeError
  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.origin !== self.location.origin) return;

  // API 请求不缓存
  if (request.url.includes("/api/")) return;

  // 静态资源：缓存优先（CacheFirst）
  if (request.url.includes("/_next/static/") || request.url.match(/\.(png|jpg|jpeg|svg|woff2?|ttf)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => new Response("Not cached", { status: 504 }));
      })
    );
    return;
  }

  // 页面请求：网络优先（NetworkFirst），离线回退缓存
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match(FALLBACK_URL)))
  );
});
