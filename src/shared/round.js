// サクズ（gerupon-lgtm/sakuzu）SZ-0.5.0 の src/shared/round.js をコピーしたもの（C-05b: 案A。直すときはサクズ側にも反映する）
// 共通にする候補（C-04b）
export function roundHalfUp(x, digits) {
  const f = 10 ** digits;
  return Math.round(x * f + (x >= 0 ? 1e-9 : -1e-9)) / f;
}
export function formatLength(m, unit = "m") {
  if (unit === "mm") return String(Math.round(m * 1000 + 1e-9));
  return roundHalfUp(m, 2).toFixed(2);
}
export const formatArea = (m2) => roundHalfUp(m2, 2).toFixed(2);
