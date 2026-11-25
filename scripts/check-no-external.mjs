// T-021 外部へ送っていないことの確認（C-01・C-02）。CIで実行する
// - 通信の関数（fetch・XMLHttpRequest・WebSocket・EventSource・sendBeacon）の使用箇所を許可リストと照合する
// - 外部のURL（http/https）がソースに書かれていないかを調べる
// - index.html の CSP に connect-src 'self' があるかを調べる
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = [...walk("src"), "sw.js", "index.html"];
// 許可するのは、Service Worker が自分のオリジンへの要求だけを中継する1か所だけ
const ALLOW = [{ file: "sw.js", re: /fetch\(e\.request\)/ }];
const NET = /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon)/;
const URL_OK = /https?:\/\/(www\.w3\.org\/2000\/svg|[a-z.]*sikumilab\.com)/;
let bad = 0;
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (NET.test(line) && !ALLOW.some((a) => f.endsWith(a.file) && a.re.test(line))) { console.error(`通信の関数: ${f}:${i + 1}: ${line.trim()}`); bad++; }
    for (const m of line.matchAll(/https?:\/\/[^\s"'`)<]+/g)) if (!URL_OK.test(m[0])) { console.error(`外部URL: ${f}:${i + 1}: ${m[0]}`); bad++; }
  });
}
const sw = readFileSync("sw.js", "utf8");
if (!/new URL\(e\.request\.url\)\.origin !== location\.origin\) return/.test(sw)) { console.error("sw.js: 自分のオリジン以外の要求を中継しない条件が見つかりません"); bad++; }
const html = readFileSync("index.html", "utf8");
if (!/Content-Security-Policy[^>]*connect-src 'self'/.test(html)) { console.error("index.html: CSP の connect-src 'self' がありません"); bad++; }
if (bad) process.exit(1);
console.log("外部への通信: なし（C-01）");
