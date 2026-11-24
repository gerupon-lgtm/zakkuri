// T-020 寸法の分かっている合成画像を作る（依存パッケージなし）。出力: tests/images/*.png と、答えの JSON
// 使い方: node scripts/make-test-images.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { computeH, applyH, invertH } from "../src/core/homography.js";

function png(w, h, gray) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = gray[y * w + x]; }
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const distSeg = (p, a, b) => { const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy; const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L)); return Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy); };
/** 用紙の上の内容（多角形の線と、用紙の枠） */
function paperFn(poly, pw, ph) {
  const frame = [{ x: 40, y: 40 }, { x: pw - 40, y: 40 }, { x: pw - 40, y: ph - 40 }, { x: 40, y: ph - 40 }];
  return (p) => {
    if (p.x < 0 || p.y < 0 || p.x > pw || p.y > ph) return null; // 用紙の外
    for (const P of [poly, frame]) for (let i = 0; i < P.length; i++) if (distSeg(p, P[i], P[(i + 1) % P.length]) < 2.5) return 20;
    return 250;
  };
}
mkdirSync("tests/images", { recursive: true });
const answers = {};

// 1) 20m×30m の長方形（0.02 m/px）。スキャン画像のつもり（A4縦 1400×1980px の用紙）
{
  const pw = 1400, ph = 1980, s = 0.02;
  const poly = [{ x: 200, y: 240 }, { x: 200 + 20 / s, y: 240 }, { x: 200 + 20 / s, y: 240 + 30 / s }, { x: 200, y: 240 + 30 / s }];
  const f = paperFn(poly, pw, ph), g = new Uint8Array(pw * ph);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) g[y * pw + x] = f({ x: x + 0.5, y: y + 0.5 });
  writeFileSync("tests/images/rect-scan.png", png(pw, ph, g));
  answers["rect-scan.png"] = { vertices: poly, edge0M: 20, areaM2: 600 };
}
// 2) L字形（0.02 m/px）。面積 = 20×30 − 10×15 = 450㎡
{
  const pw = 1400, ph = 1980, s = 0.02, o = { x: 200, y: 240 };
  const L = [[0, 0], [20, 0], [20, 15], [10, 15], [10, 30], [0, 30]].map(([x, y]) => ({ x: o.x + x / s, y: o.y + y / s }));
  const f = paperFn(L, pw, ph), g = new Uint8Array(pw * ph);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) g[y * pw + x] = f({ x: x + 0.5, y: y + 0.5 });
  writeFileSync("tests/images/l-scan.png", png(pw, ph, g));
  answers["l-scan.png"] = { vertices: L, edge0M: 20, areaM2: 450 };
}
// 3) 1) の用紙を斜めから撮った写真（射影変換。背景は灰色）
{
  const pw = 1400, ph = 1980, s = 0.02, W = 2000, H = 2400;
  const poly = [{ x: 200, y: 240 }, { x: 200 + 20 / s, y: 240 }, { x: 200 + 20 / s, y: 240 + 30 / s }, { x: 200, y: 240 + 30 / s }];
  const paperCorners = [{ x: 0, y: 0 }, { x: pw, y: 0 }, { x: pw, y: ph }, { x: 0, y: ph }];
  const photoCorners = [{ x: 380, y: 260 }, { x: 1640, y: 330 }, { x: 1880, y: 2230 }, { x: 150, y: 2150 }];
  const H1 = computeH(paperCorners, photoCorners), Hi = invertH(H1);
  const f = paperFn(poly, pw, ph), g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = f(applyH(Hi, { x: x + 0.5, y: y + 0.5 })); g[y * W + x] = v ?? 120; }
  writeFileSync("tests/images/rect-photo.png", png(W, H, g));
  answers["rect-photo.png"] = { corners: photoCorners, paper: "A4", orientation: "portrait", vertices: poly.map((p) => applyH(H1, p)), edge0M: 20, areaM2: 600 };
}
writeFileSync("tests/images/answers.json", JSON.stringify(answers, null, 1));
console.log("tests/images に3枚を作りました");
