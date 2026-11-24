// L-04 縮尺の推定。入力はすべて補正後座標（px）。DOMに触らない純粋な計算
export const ANISO_MIN_ANGLE_DEG = 30; // 縦横別の縮尺を推定できる、辺どうしの向きの差の最小値【想定】
export const FLAG_PCT = 3;            // 食い違いに印を付ける閾値（±%）【想定】
export const ANISO_WARN_PCT = 3;      // 縦横の比がこれを超えたら警告【想定】

/**
 * @param {object} p
 * @param {{id?:string, p1:{x,y}, p2:{x,y}, lengthM:number}[]} p.lengths 辺の基準（補正後座標）
 * @param {number|null} p.areaPx 補正後座標での多角形の面積（px²）。外周がないときは null
 * @param {{valueM2:number, chisekiChosa:boolean}|null} p.area 公簿面積
 * @param {boolean} p.anisotropic 縦横別の縮尺を使うか
 * @returns {{code?:string, field?:string, refId?:string, method?:"length"|"area", s?:number, sx?:number, sy?:number, refs?:object[], aniso?:object, warnings?:string[]}}
 */
export function estimateScale({ lengths = [], areaPx = null, area = null, anisotropic = false }) {
  // (4) 入力チェック
  for (const r of lengths) {
    if (!(Number.isFinite(r.lengthM) && r.lengthM > 0)) return { code: "REF_NON_POSITIVE", refId: r.id };
    if (Math.hypot(r.p2.x - r.p1.x, r.p2.y - r.p1.y) < 1) return { code: "REF_SAME_POINT", refId: r.id };
  }
  const hasArea = area != null && area.valueM2 != null && area.valueM2 !== "";
  if (hasArea && !(Number.isFinite(area.valueM2) && area.valueM2 > 0)) return { code: "REF_NON_POSITIVE", field: "area" };
  const areaUsable = hasArea && areaPx > 0;
  const L = lengths.map((r) => ({ id: r.id, dx: r.p2.x - r.p1.x, dy: r.p2.y - r.p1.y, Lm: r.lengthM, l: Math.hypot(r.p2.x - r.p1.x, r.p2.y - r.p1.y) }));

  // (1) 方式
  if (!L.length && !areaUsable) return { code: hasArea ? "AREA_NEEDS_POLYGON" : "SCALE_NO_REFERENCE" };
  let method, s;
  const sArea = areaUsable ? Math.sqrt(area.valueM2 / areaPx) : null;
  if (!L.length || (area?.chisekiChosa && areaUsable)) { method = "area"; s = sArea; }
  else { method = "length"; s = L.reduce((t, r) => t + r.l * r.Lm, 0) / L.reduce((t, r) => t + r.l * r.l, 0); }
  let sx = s, sy = s;

  // (3) 縦横別
  const warnings = [];
  let aniso = { enabled: !!anisotropic };
  if (anisotropic) {
    const res = estimateAniso(L, method === "area" && area?.chisekiChosa ? area.valueM2 / areaPx : null, areaUsable ? area.valueM2 / areaPx : null);
    aniso = { enabled: true, ...res };
    if (res.ok) {
      sx = res.sx; sy = res.sy;
      if (Math.abs(sx / sy - 1) * 100 > ANISO_WARN_PCT) warnings.push("ANISO_LARGE_RATIO");
    } else warnings.push("ANISO_INSUFFICIENT");
  }

  // (2) 基準ごとの食い違い（採用した縮尺で予測した長さ・面積との比）
  const refs = L.map((r) => {
    const pred = Math.hypot(sx * r.dx, sy * r.dy);
    const diffPct = (r.Lm / pred - 1) * 100;
    return { kind: "length", id: r.id, lengthM: r.Lm, px: r.l, si: r.Lm / r.l, predM: pred, diffPct, flag: Math.abs(diffPct) > FLAG_PCT };
  });
  if (areaUsable) {
    const predA = areaPx * sx * sy;
    const diffPct = (Math.sqrt(area.valueM2 / predA) - 1) * 100;
    refs.push({ kind: "area", valueM2: area.valueM2, si: sArea, predM2: predA, diffPct, flag: Math.abs(diffPct) > FLAG_PCT });
  }
  return { method, s, sx, sy, refs, aniso, warnings, usedLengths: method === "length" ? L.length : 0 };
}

/** 2本の向きの差（0〜90°） */
const lineAngleDiff = (a, b) => { let d = Math.abs(Math.atan2(a.dy, a.dx) - Math.atan2(b.dy, b.dx)) * 180 / Math.PI % 180; return d > 90 ? 180 - d : d; };

/**
 * 縦横別の縮尺。fixK: 地籍調査済みで面積を固定するとき k=A/a。kAny: 面積があるとき k（辺1本の場合に使う）
 */
export function estimateAniso(L, fixK, kAny) {
  // 地籍調査済み・面積あり: k を固定して比 r を三分探索
  if (fixK != null && L.length >= 1) {
    const f = (r) => L.reduce((t, x) => t + (x.Lm ** 2 - fixK * (r * x.dx ** 2 + x.dy ** 2 / r)) ** 2, 0);
    let lo = 0.8, hi = 1.25;
    for (let i = 0; i < 200; i++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (f(m1) < f(m2)) hi = m2; else lo = m1; }
    const r = (lo + hi) / 2;
    return { ok: true, mode: "areaFixed", sx: Math.sqrt(fixK * r), sy: Math.sqrt(fixK / r) };
  }
  if (L.length >= 2) {
    let maxAng = 0;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) maxAng = Math.max(maxAng, lineAngleDiff(L[i], L[j]));
    if (maxAng < ANISO_MIN_ANGLE_DEG) return { ok: false, code: "ANISO_INSUFFICIENT", reason: "angle", maxAng };
    // L² = u·dx² + v·dy² の最小二乗（正規方程式）
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    for (const x of L) { const X = x.dx ** 2, Y = x.dy ** 2, T = x.Lm ** 2; a11 += X * X; a12 += X * Y; a22 += Y * Y; b1 += X * T; b2 += Y * T; }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-12 * a11 * a22) return { ok: false, code: "ANISO_INSUFFICIENT", reason: "singular" };
    const u = (b1 * a22 - b2 * a12) / det, v = (a11 * b2 - a12 * b1) / det;
    if (!(u > 0 && v > 0)) return { ok: false, code: "ANISO_INSUFFICIENT", reason: "negative" };
    return { ok: true, mode: "lengths", sx: Math.sqrt(u), sy: Math.sqrt(v), maxAng };
  }
  if (L.length === 1 && kAny != null) {
    const { dx, dy, Lm } = L[0], X = dx * dx, Y = dy * dy, T = Lm * Lm, k = kAny;
    let cands = [];
    if (X < 1e-9) { const sy = Math.sqrt(T / Y); cands = [{ sx: k / sy, sy }]; }
    else if (Y < 1e-9) { const sx = Math.sqrt(T / X); cands = [{ sx, sy: k / sx }]; }
    else {
      const D = T * T - 4 * X * k * k * Y; // X u² − T u + k² Y = 0
      if (D < 0) return { ok: false, code: "ANISO_INSUFFICIENT", reason: "discriminant" };
      for (const u of [(T + Math.sqrt(D)) / (2 * X), (T - Math.sqrt(D)) / (2 * X)]) if (u > 0) { const sx = Math.sqrt(u); cands.push({ sx, sy: k / sx }); }
    }
    if (!cands.length) return { ok: false, code: "ANISO_INSUFFICIENT", reason: "negative" };
    cands.sort((a, b) => Math.abs(Math.log(a.sx / a.sy)) - Math.abs(Math.log(b.sx / b.sy)));
    return { ok: true, mode: "oneLengthArea", ...cands[0] };
  }
  return { ok: false, code: "ANISO_INSUFFICIENT", reason: "few" };
}

/** 公図の推定縮尺 1/N（用紙上の mm/px が分かるときだけ） */
export function paperScaleDenominator(sMeterPerPx, mmPerPx) {
  if (!(sMeterPerPx > 0 && mmPerPx > 0)) return null;
  return sMeterPerPx * 1000 / mmPerPx;
}
