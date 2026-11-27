// ざっくり地積の Service Worker（F-016。サクズの sw.js と同じ作り: 版ごとの事前キャッシュ）
// このファイルは scripts/make-sw.mjs で作る（手で書き換えない）
const VERSION = "ZC-0.3.2"; // src/version.js と同じ値（scripts/check-version.mjs で確認）
const CACHE = `zakkuri-${VERSION}`;
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-192.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon.svg",
  "icons/favicon-32.png",
  "fonts/BIZUDPGothic-Bold.woff2",
  "fonts/BIZUDPGothic-Regular.woff2",
  "vendor/pdfjs/pdf.min.mjs",
  "vendor/pdfjs/pdf.worker.min.mjs",
  "src/core/cadexport.js",
  "src/core/chimoku.js",
  "src/core/compute.js",
  "src/core/homography.js",
  "src/core/sansha.js",
  "src/core/scale.js",
  "src/core/triangulate.js",
  "src/io/image.js",
  "src/io/sjis.js",
  "src/io/store.js",
  "src/io/workfile.js",
  "src/shared/date.js",
  "src/shared/geometry.js",
  "src/shared/importers.js",
  "src/shared/print.js",
  "src/shared/rotate.js",
  "src/shared/round.js",
  "src/ui/app.js",
  "src/ui/messages.js",
  "src/ui/sheet.js",
  "src/ui/styles.css",
  "src/version.js"];
self.addEventListener("install", (e) => {
  // 新版の事前キャッシュには、HTTP キャッシュを使わずにファイルを取り直す。
  const requests = FILES.map((file) => new Request(file, { cache: "reload" }));
  e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
});
self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); }); // 「更新する」で待機中の新版にすぐ切り替える
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("zakkuri-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
