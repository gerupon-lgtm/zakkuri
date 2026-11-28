// 入力（作業データ）から、補正・縮尺・分割・三斜求積までを毎回計算し直す（計算結果は保存しない）。DOMに触らない
import { buildRectify, mmPerPx } from "./homography.js";
import { estimateScale, paperScaleDenominator } from "./scale.js";
import { triangulate, trisValid } from "./triangulate.js";
import { sansha } from "./sansha.js";
import { adjustToLengths } from "./adjust.js";
import { truncateArea } from "./chimoku.js";
import { validatePolygon, area, segmentsIntersect } from "../shared/geometry.js";

/** 辺の基準の2点を、今の頂点に合わせて解決する（頂点に付いた基準は頂点と一緒に動く） */
export function resolveRef(work, r) {
  const v = (id) => work.vertices.find((x) => x.id === id);
  const a = r.v1 ? v(r.v1) : r.p1, b = r.v2 ? v(r.v2) : r.p2;
  return a && b ? { p1: { x: a.x, y: a.y }, p2: { x: b.x, y: b.y } } : null;
}

/** 交差している辺の組（外周が閉じているとき） */
export function crossingEdges(pts) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) out.push([i, j]);
  }
  return out;
}

export function compute(work) {
  const out = { errors: [], warnings: [] };
  const img = work.image; if (!img) return out;
  const R = buildRectify(work.rectify, img.width, img.height);
  if (R.code) { out.rectifyError = R.code; out.errors.push(R.code); return out; }
  out.R = R;
  const V = work.vertices.map(R.map);
  out.Vr = V;
  const closed = work.closed && V.length >= 3;
  out.polyCode = closed ? validatePolygon(V) : (work.vertices.length >= 3 ? null : "POLY_TOO_FEW");
  if (closed && out.polyCode === "POLY_SELF_INTERSECT") out.crossing = crossingEdges(V);
  const polyOk = closed && !out.polyCode;
  const areaPx = polyOk ? area(V) : null;

  // 縮尺
  const lengths = [];
  for (const r of work.refs.lengths) { const p = resolveRef(work, r); if (p) lengths.push({ id: r.id, p1: R.map(p.p1), p2: R.map(p.p2), lengthM: r.lengthM }); }
  const ar = work.refs.area;
  const areaRef = ar && ar.valueM2 != null && ar.valueM2 !== "" ? { valueM2: Number(ar.valueM2), chisekiChosa: !!ar.chisekiChosa } : null;
  const sc = estimateScale({ lengths, areaPx, area: areaRef, anisotropic: !!work.anisotropic });
  out.scale = sc;
  if (sc.code) return out;
  out.warnings.push(...sc.warnings);
  const mm = mmPerPx(work.rectify.paper, R.width, R.height);
  out.paperDen = mm ? paperScaleDenominator(Math.sqrt(sc.sx * sc.sy), mm) : null;
  const toReal = (p) => ({ x: p.x * sc.sx, y: p.y * sc.sy });
  out.real = V.map(toReal);
  if (work.north) { const a = R.map({ x: work.north.x1, y: work.north.y1 }), b = R.map({ x: work.north.x2, y: work.north.y2 }); out.northReal = { x: (b.x - a.x) * sc.sx, y: (b.y - a.y) * sc.sy }; }
  out.edgeLen = V.map((p, i) => { const q = V[(i + 1) % V.length]; return Math.hypot((q.x - p.x) * sc.sx, (q.y - p.y) * sc.sy); });
  if (!polyOk) return out;

  // 求積に使う長さ（F-019）: "input" なら、頂点どうしに入力した長さに合わせて頂点を調整する
  const idx = new Map(work.vertices.map((v, i) => [v.id, i]));
  const cons = work.refs.lengths.filter((r) => r.v1 && r.v2 && idx.has(r.v1) && idx.has(r.v2) && r.v1 !== r.v2).map((r) => ({ i: idx.get(r.v1), j: idx.get(r.v2), L: r.lengthM }));
  out.adjustable = cons.length > 0;
  if (work.lengthMode === "input" && cons.length) {
    const a = adjustToLengths(out.real, cons);
    out.adjust = { maxMove: a.maxMove, maxResidual: a.maxResidual, count: cons.length, code: a.code };
    if (a.code) out.warnings.push(a.code);
    if (validatePolygon(a.pts)) { out.adjust.code = "ADJUST_BROKE_SHAPE"; out.warnings.push("ADJUST_BROKE_SHAPE"); }
    else { out.real = a.pts; out.edgeLen = a.pts.map((p, i) => { const q = a.pts[(i + 1) % a.pts.length]; return Math.hypot(q.x - p.x, q.y - p.y); }); }
  }

  // 分割（保存した分け方が今の頂点で有効なら使う。無効なら自動分割に戻す）
  let tris = work.triangles;
  out.trisReset = false;
  if (!(tris && trisValid(out.real, tris))) { out.trisReset = !!tris; tris = triangulate(out.real); }
  out.tris = tris;
  out.sansha = sansha(out.real, tris);
  out.chiseki = truncateArea(out.sansha.T, work.chimoku);
  out.approxM2 = out.sansha.T / 20000;
  if (areaRef && sc.method !== "area") {
    const base = out.chiseki.value ?? out.approxM2;
    out.compare = { diff: base - areaRef.valueM2, pct: (base - areaRef.valueM2) / areaRef.valueM2 * 100 };
  }
  // 三斜の合計と座標法の差（利用者には見せない）
  if (Math.abs(out.sansha.diff) > out.sansha.tolerance && typeof console !== "undefined") console.debug("[zakkuri] 三斜と座標法の差が大きい", out.sansha.diff, out.sansha.tolerance);
  return out;
}
