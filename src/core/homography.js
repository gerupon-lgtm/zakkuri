// L-02 台形補正（射影変換）。DOMに触らない純粋な計算
import { segmentsIntersect } from "../shared/geometry.js";

export const PAPER_MM = { A4: [297, 210], A3: [420, 297], B4: [364, 257] };
export const LONG_SIDE_PX = 4000; // 補正後の長辺【想定】

/** 8元の連立方程式（ガウスの消去法・部分ピボット） */
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** 四角形として使えるか（3点が一直線上・自己交差を除く） */
export function quadValid(q) {
  if (!q || q.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 1e-6 * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - a.x, c.y - a.y))) return false;
  }
  if (segmentsIntersect(q[0], q[1], q[2], q[3]) || segmentsIntersect(q[1], q[2], q[3], q[0])) return false;
  return true;
}

/** src の4点を dst の4点へ移す行列 H（3×3、h33=1）。作れないときは null */
export function computeH(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return h ? [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]] : null;
}

export function applyH(H, p) {
  const w = H[2][0] * p.x + H[2][1] * p.y + H[2][2];
  return { x: (H[0][0] * p.x + H[0][1] * p.y + H[0][2]) / w, y: (H[1][0] * p.x + H[1][1] * p.y + H[1][2]) / w };
}

export function invertH(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) return null;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
}

/** 補正後の幅・高さ（px）。用紙が分かれば用紙の比、不明なら向かい合う辺の平均の比 */
export function rectifiedSize(corners, paper = "unknown", orientation = "landscape", longSide = LONG_SIDE_PX) {
  let ratio; // 幅 ÷ 高さ
  if (PAPER_MM[paper]) { const [L, S] = PAPER_MM[paper]; ratio = orientation === "portrait" ? S / L : L / S; }
  else {
    const d = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
    const w = (d(corners[0], corners[1]) + d(corners[3], corners[2])) / 2;
    const h = (d(corners[0], corners[3]) + d(corners[1], corners[2])) / 2;
    ratio = w / h;
  }
  return ratio >= 1 ? { width: longSide, height: Math.round(longSide / ratio) } : { width: Math.round(longSide * ratio), height: longSide };
}

/**
 * 補正の設定から、元画像座標 → 測る座標（補正後座標）への変換を作る。
 * 補正しないときは恒等変換。四隅が不正なら { code: "QUAD_DEGENERATE" }
 */
export function buildRectify(rectify, imgW, imgH) {
  if (!rectify?.enabled) return { H: null, width: imgW, height: imgH, map: (p) => ({ x: p.x, y: p.y }), unmap: (p) => ({ x: p.x, y: p.y }) };
  const c = rectify.corners;
  if (!quadValid(c)) return { code: "QUAD_DEGENERATE" };
  const { width, height } = rectifiedSize(c, rectify.paper, rectify.orientation);
  const H = computeH(c, [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]);
  const Hi = H && invertH(H);
  if (!Hi) return { code: "QUAD_DEGENERATE" };
  return { H, Hi, width, height, map: (p) => applyH(H, p), unmap: (p) => applyH(Hi, p) };
}

/** 用紙上で 1px が何mmか（用紙が分かるときだけ）。補正後（または元）の画像の長辺を用紙の長辺に合わせる */
export function mmPerPx(paper, width, height) {
  if (!PAPER_MM[paper]) return null;
  return PAPER_MM[paper][0] / Math.max(width, height);
}
