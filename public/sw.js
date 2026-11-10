/* متروجو Service Worker — نصب‌پذیری و کار آفلاین سبک (شبکه-اول) */
const CACHE = "metrojo-v3";
const PRECACHE = ["/metrojo-app-icon.png", "/metrojo-symbol.png", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // فونت‌های گوگل: کش-اول
  if (url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com") {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  const isImmutableAsset =
    url.pathname.startsWith("/icons") ||
    url.pathname === "/metrojo-app-icon.png" ||
    url.pathname === "/metrojo-symbol.png" ||
    url.pathname === "/manifest.json";

  if (isImmutableAsset) {
    // آیکون‌ها و مانیفست: کش-اول
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req)
            .then((res) => {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
              return res;
            })
            .catch(() => hit)
      )
    );
    return;
  }

  // همه درخواست‌های دیگر (صفحات، API، چانک‌ها): شبکه-اول + کش به‌عنوان پشتیبان آفلاین
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.headers.get("accept") || "").includes("text/html")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          if ((req.headers.get("accept") || "").includes("text/html")) return caches.match("/");
          return Response.error();
        })
      )
  );
});
