// サクズ（gerupon-lgtm/sakuzu）SZ-0.5.0 の src/shared/rotate.js をコピーしたもの（C-05b: 案A。直すときはサクズ側にも反映する）
// 共通にする候補（C-04b）。見た目の回転（座標そのものは変えない）
export const normDeg = (d) => { let x = ((d + 180) % 360 + 360) % 360 - 180; return x === -180 ? 180 : x; };
export function rotate(p, deg) {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}
/** 辺 a→b を水平（"h"）または垂直（"v"）にそろえる回転角（度）。回転量が小さくなるほうを選ぶ */
export function alignAngle(a, b, mode = "h") {
  const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  const target = mode === "v" ? 90 : 0;
  let d = normDeg(target - ang);
  if (d > 90) d -= 180; else if (d < -90) d += 180;   // 向きは問わない（辺の向きを反転しても同じ線）
  return normDeg(d);
}
/** 文字が上下逆にならない角度（度、画面座標系の回転） */
export function readableDeg(deg) { let d = normDeg(deg); if (d > 90) d -= 180; if (d < -90) d += 180; return d; }
