// サクズ（gerupon-lgtm/sakuzu）SZ-0.5.0 の src/shared/print.js をコピーしたもの（C-05b: 案A。直すときはサクズ側にも反映する）
// 共通にする候補（C-04b）。用紙と縮尺
export const PAPERS = { A4: [297, 210], A3: [420, 297] };
export function paperSize(paper, orientation) {
  const [w, h] = PAPERS[paper] ?? PAPERS.A4;
  return orientation === "portrait" ? { w: h, h: w } : { w, h };
}
/** 描画範囲（mm）に、実寸の外接矩形（m）が収まる最大の縮尺（分母が最小）を選ぶ */
export function selectDrawingScale(widthM, heightM, areaWmm, areaHmm, candidates) {
  for (const den of [...candidates].sort((a, b) => a - b)) {
    if (widthM * 1000 / den <= areaWmm && heightM * 1000 / den <= areaHmm) return { denominator: den, fixed: true };
  }
  const den = Math.max(widthM * 1000 / areaWmm, heightM * 1000 / areaHmm);
  return { denominator: den, fixed: false };
}
