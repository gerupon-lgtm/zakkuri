// sw.js の事前キャッシュの一覧と版を、今のファイルから作り直す（版を上げたとき・ファイルを足したときに実行する）
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }).sort();
const v = /APP_VERSION = "([^"]+)"/.exec(readFileSync("src/version.js", "utf8"))[1];
const files = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", ...walk("fonts").filter((f) => f.endsWith(".woff2")), "vendor/pdfjs/pdf.min.mjs", "vendor/pdfjs/pdf.worker.min.mjs", ...walk("src")];
writeFileSync("sw.js", `// ざっくり地積の Service Worker（F-016。サクズの sw.js と同じ作り: 版ごとの事前キャッシュ）
// このファイルは scripts/make-sw.mjs で作る（手で書き換えない）
const VERSION = "${v}"; // src/version.js と同じ値（scripts/check-version.mjs で確認）
const CACHE = \`zakkuri-\${VERSION}\`;
const FILES = [
  ${files.map((f) => JSON.stringify(f)).join(",\n  ")}];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("zakkuri-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
`);
console.log(`sw.js を ${v} で作り直しました（${files.length}ファイル）`);
