// L-05 三角形への分割と対角線の入れ替え。DOMに触らない純粋な計算
import { signedArea, area } from "../shared/geometry.js";

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const angleAt = (p, a, b) => { const v1 = { x: a.x - p.x, y: a.y - p.y }, v2 = { x: b.x - p.x, y: b.y - p.y }; const c = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1); return Math.acos(Math.max(-1, Math.min(1, c))); };
const minAngle = (a, b, c) => Math.min(angleAt(a, b, c), angleAt(b, c, a), angleAt(c, a, b));

/** 点 p が三角形 abc（向きは正）の内側か辺上にあるか */
function inTri(p, a, b, c, eps) {
  return cross(a, b, p) >= -eps && cross(b, c, p) >= -eps && cross(c, a, p) >= -eps;
}

/**
 * 耳切り法。各段階で、最小内角が最も大きい耳を選ぶ。
 * @returns {[number,number,number][]} 頂点番号の組（多角形と同じ向き）。分割できないときは null
 */
export function triangulate(pts) {
  const n = pts.length; if (n < 3) return null;
  const sgn = Math.sign(signedArea(pts)) || 1;
  const P = pts.map((p) => ({ x: p.x * sgn, y: p.y })); // 反時計回りとして扱えるよう、時計回りなら x を反転
  const scale = Math.max(...pts.map((p) => Math.abs(p.x)), ...pts.map((p) => Math.abs(p.y)), 1);
  const eps = 1e-12 * scale * scale;
  const idx = [...Array(n).keys()], tris = [];
  while (idx.length > 3) {
    let best = null;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i - 1 + idx.length) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = P[ia], b = P[ib], c = P[ic];
      const cr = cross(a, b, c);
      if (cr <= eps) continue; // 凸でない（一直線上を含む）
      let ok = true;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; const q = P[j];
        if ((q.x === a.x && q.y === a.y) || (q.x === c.x && q.y === c.y)) continue;
        if (inTri(q, a, b, c, eps)) { ok = false; break; } }
      if (!ok) continue;
      const m = minAngle(a, b, c);
      if (!best || m > best.m + 1e-12) best = { i, m, t: [ia, ib, ic] };
    }
    if (!best) { // 一直線上の頂点しか残っていないなど。面積0の三角形で埋める
      const i = idx.findIndex((_, k) => cross(P[idx[(k - 1 + idx.length) % idx.length]], P[idx[k]], P[idx[(k + 1) % idx.length]]) >= -eps);
      if (i < 0) return null;
      best = { i, t: [idx[(i - 1 + idx.length) % idx.length], idx[i], idx[(i + 1) % idx.length]] };
    }
    tris.push(best.t); idx.splice(best.i, 1);
  }
  tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** 2つの三角形が共有している対角線（外周の辺は除く） */
export function diagonals(tris, n) {
  const seen = new Map(), out = [];
  tris.forEach((t, ti) => { for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3];
    if ((a + 1) % n === b || (b + 1) % n === a) continue;
    const K = key(a, b); if (seen.has(K)) out.push({ a: Math.min(a, b), b: Math.max(a, b), t1: seen.get(K), t2: ti }); else seen.set(K, ti); } });
  return out;
}

/** 対角線 a-b を入れ替える。凸でない四角形なら { code: "FLIP_NOT_CONVEX" } */
export function flip(pts, tris, a, b) {
  const d = diagonals(tris, pts.length).find((x) => x.a === Math.min(a, b) && x.b === Math.max(a, b));
  if (!d) return { code: "FLIP_NOT_DIAGONAL" };
  const other = (t) => t.find((v) => v !== a && v !== b);
  const c = other(tris[d.t1]), e = other(tris[d.t2]);
  // 四角形 a-c-b-e が凸か（c と e が a-b の反対側、a と b が c-e の反対側）
  const s1 = cross(pts[a], pts[b], pts[c]) * cross(pts[a], pts[b], pts[e]);
  const s2 = cross(pts[c], pts[e], pts[a]) * cross(pts[c], pts[e], pts[b]);
  if (!(s1 < 0 && s2 < 0)) return { code: "FLIP_NOT_CONVEX" };
  const sgn = Math.sign(signedArea(pts)) || 1;
  const orient = (t) => (Math.sign(signedArea(t.map((i) => pts[i]))) === sgn ? t : [t[0], t[2], t[1]]);
  const out = tris.map((t) => [...t]);
  out[d.t1] = orient([c, e, a]); out[d.t2] = orient([e, c, b]);
  return { tris: out };
}

/** 分け方が今の頂点に対して有効か（頂点数・向き・面積の合計） */
export function trisValid(pts, tris) {
  const n = pts.length;
  if (!Array.isArray(tris) || tris.length !== n - 2) return false;
  if (tris.some((t) => t.length !== 3 || t.some((i) => !(i >= 0 && i < n)))) return false;
  const sgn = Math.sign(signedArea(pts));
  let sum = 0;
  for (const t of tris) { const sa = signedArea(t.map((i) => pts[i])); if (Math.sign(sa) !== sgn && Math.abs(sa) > 1e-9) return false; sum += Math.abs(sa); }
  const A = area(pts);
  return Math.abs(sum - A) <= 1e-9 * Math.max(1, A);
}
