// サクズの scripts/check-version.mjs と同じ仕組み
// 版の同値チェック（src/version.js と sw.js）と、sw.js の事前キャッシュに src のファイルがすべて入っているかの確認
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path/posix";
const v = /APP_VERSION = "([^"]+)"/.exec(readFileSync("src/version.js", "utf8"))[1];
const sw = readFileSync("sw.js", "utf8");
const sv = /const VERSION = "([^"]+)"/.exec(sw)[1];
let ok = true;
if (v !== sv) { console.error(`版が食い違っています: src/version.js=${v} sw.js=${sv}`); ok = false; }
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk("src")) if (!sw.includes(`"${f}"`)) { console.error(`sw.js の事前キャッシュに入っていません: ${f}`); ok = false; }
if (!ok) process.exit(1);
console.log(`版 ${v}: OK`);
