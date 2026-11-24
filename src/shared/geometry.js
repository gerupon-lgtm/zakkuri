// サクズ（gerupon-lgtm/sakuzu）SZ-0.5.0 の src/shared/geometry.js をコピーしたもの（C-05b: 案A。直すときはサクズ側にも反映する）
// 共通にする候補（C-04b: サクズ固有の処理を混ぜない）
export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const headingOf = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

export function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}
export const area = (pts) => Math.abs(signedArea(pts));

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
export function segmentsIntersect(p1, p2, q1, q2) {
  const d1 = cross(q1, q2, p1), d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1), d4 = cross(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
export function validatePolygon(pts) {
  if (pts.length < 3) return "POLY_TOO_FEW";
  const n = pts.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return "POLY_SELF_INTERSECT";
  }
  if (area(pts) < 1e-12) return "POLY_ZERO_AREA";
  return null;
}
