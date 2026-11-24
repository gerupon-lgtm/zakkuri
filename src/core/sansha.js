// L-06 三斜求積。実座標（m）の頂点と三角形の分け方から、三斜求積表を作る。DOMに触らない純粋な計算
import { area as polyArea } from "../shared/geometry.js";

/** m を cm の整数に（四捨五入、0.5は切り上げ。浮動小数点の誤差を補正する） */
export const toCm = (m) => Math.round(m * 100 + 1e-9);

/** cm² の整数を ㎡ の小数第4位までの文字列に */
export function cm2ToM2Text(c) { const s = String(c).padStart(5, "0"); return `${s.slice(0, -4)}.${s.slice(-4)}`; }
export const cmText = (c) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

/**
 * @param {{x,y}[]} pts 実座標（m）
 * @param {[number,number,number][]} tris
 * @returns {{rows:{no,tri,base:[number,number],apex:number,bCm,hCm,double,foot:{x,y}}[], T:number, coordArea:number, diff:number}}
 */
export function sansha(pts, tris) {
  const rows = tris.map((t, i) => {
    const P = t.map((k) => pts[k]);
    const edges = [[0, 1], [1, 2], [2, 0]].map(([a, b]) => ({ a, b, len: Math.hypot(P[b].x - P[a].x, P[b].y - P[a].y) }));
    const e = edges.reduce((m, x) => (x.len > m.len + 1e-12 ? x : m));
    const apexLocal = 3 - e.a - e.b;
    const A = polyArea(P), b = e.len, h = b > 0 ? 2 * A / b : 0;
    const bCm = toCm(b), hCm = toCm(h);
    // 高さの足（図に高さの線を描くため）
    const pa = P[e.a], pb = P[e.b], pc = P[apexLocal];
    const tt = b > 0 ? ((pc.x - pa.x) * (pb.x - pa.x) + (pc.y - pa.y) * (pb.y - pa.y)) / (b * b) : 0;
    return { no: i + 1, tri: t, base: [t[e.a], t[e.b]], apex: t[apexLocal], b, h, bCm, hCm, double: bCm * hCm, foot: { x: pa.x + tt * (pb.x - pa.x), y: pa.y + tt * (pb.y - pa.y) } };
  });
  const T = rows.reduce((s, r) => s + r.double, 0);
  const coordArea = polyArea(pts);
  // 丸めで起こりうる差の目安: Σ(b+h)×0.005㎡ 程度
  const tolerance = rows.reduce((s, r) => s + (r.b + r.h) * 0.005, 0);
  return { rows, T, coordArea, diff: T / 20000 - coordArea, tolerance };
}
