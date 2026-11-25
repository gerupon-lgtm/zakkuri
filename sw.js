// ざっくり地積の Service Worker（F-016。サクズの sw.js と同じ作り: 版ごとの事前キャッシュ）
// このファイルは scripts/make-sw.mjs で作る（手で書き換えない）
const VERSION = "ZC-0.3.0"; // src/version.js と同じ値（scripts/check-version.mjs で確認）
const CACHE = `zakkuri-${VERSION}`;
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
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
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("zakkuri-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
