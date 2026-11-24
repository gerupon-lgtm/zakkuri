import test from "node:test";
import assert from "node:assert/strict";
import { computeH, applyH, invertH, quadValid, buildRectify, rectifiedSize } from "../src/core/homography.js";
import { estimateScale } from "../src/core/scale.js";
import { triangulate, flip, diagonals, trisValid } from "../src/core/triangulate.js";
import { sansha, toCm, cm2ToM2Text } from "../src/core/sansha.js";
import { truncateArea, CHIMOKU } from "../src/core/chimoku.js";
import { area, validatePolygon } from "../src/shared/geometry.js";
import { todayJst, parseDateInput } from "../src/shared/date.js";
import { selectDrawingScale } from "../src/shared/print.js";

const near = (a, b, e = 1e-9, m = "") => assert.ok(Math.abs(a - b) <= e, `${m} ${a} != ${b} (±${e})`);
const P = (x, y) => ({ x, y });

// ---------- L-02 射影変換（T-003） ----------
test("L-02: 射影変換の往復で0.5px以内に戻る", () => {
  const rect = [P(0, 0), P(4000, 0), P(4000, 2828), P(0, 2828)];
  const quad = [P(312, 205), P(3810, 420), P(3602, 2911), P(150, 2650)]; // 斜めから撮った長方形の四隅
  const H = computeH(quad, rect), Hi = invertH(H);
  for (let i = 0; i < 4; i++) { const q = applyH(H, quad[i]); near(q.x, rect[i].x, 0.5); near(q.y, rect[i].y, 0.5); }
  for (const p of [P(1000, 1000), P(2500, 300), P(3999, 2800)]) { const r = applyH(Hi, applyH(H, p)); near(r.x, p.x, 0.5); near(r.y, p.y, 0.5); }
});
test("L-02: 不正な四隅は QUAD_DEGENERATE", () => {
  assert.equal(quadValid([P(0, 0), P(10, 0), P(20, 0), P(0, 10)]), false); // 3点が一直線上
  assert.equal(quadValid([P(0, 0), P(10, 10), P(10, 0), P(0, 10)]), false); // 交差
  assert.equal(buildRectify({ enabled: true, corners: [P(0, 0), P(10, 10), P(10, 0), P(0, 10)] }, 100, 100).code, "QUAD_DEGENERATE");
  assert.equal(quadValid([P(0, 0), P(10, 0), P(10, 10), P(0, 10)]), true);
});
test("L-02: 補正後の大きさ（用紙の比・不明のとき）", () => {
  assert.deepEqual(rectifiedSize([], "A4", "landscape"), { width: 4000, height: Math.round(4000 * 210 / 297) });
  assert.deepEqual(rectifiedSize([], "A4", "portrait"), { width: Math.round(4000 * 210 / 297), height: 4000 });
  const r = rectifiedSize([P(0, 0), P(300, 0), P(300, 200), P(0, 200)], "unknown");
  assert.deepEqual(r, { width: 4000, height: 2667 });
});
test("L-02: 四隅を直しても、元画像座標の頂点はそのまま・補正後座標は新しいHで計算し直される", () => {
  const v = P(500, 400);
  const r1 = buildRectify({ enabled: true, corners: [P(100, 100), P(900, 120), P(880, 700), P(90, 680)], paper: "A4", orientation: "landscape" }, 1000, 800);
  const r2 = buildRectify({ enabled: true, corners: [P(110, 100), P(900, 120), P(880, 700), P(90, 680)], paper: "A4", orientation: "landscape" }, 1000, 800);
  assert.notDeepEqual(r1.map(v), r2.map(v)); assert.deepEqual(v, P(500, 400));
});

// ---------- L-03 多角形（T-002。共通部品） ----------
test("L-03: 凸・L字・星形・一直線", () => {
  assert.equal(validatePolygon([P(0, 0), P(4, 0), P(4, 3), P(0, 3)]), null);
  const L = [P(0, 0), P(4, 0), P(4, 2), P(2, 2), P(2, 4), P(0, 4)]; assert.equal(validatePolygon(L), null); near(area(L), 12);
  const star = [0, 1, 2, 3, 4].map((k) => P(Math.cos(k * 4 * Math.PI / 5), Math.sin(k * 4 * Math.PI / 5)));
  assert.equal(validatePolygon(star), "POLY_SELF_INTERSECT");
  assert.equal(validatePolygon([P(0, 0), P(1, 1), P(2, 2)]), "POLY_ZERO_AREA");
});

// ---------- L-04 縮尺の推定（T-004） ----------
const rect = (w, h) => [P(0, 0), P(w, 0), P(w, h), P(0, h)];
test("L-04(5): 20m×30m を 0.01m/px で。辺1本でも面積だけでも s=0.01", () => {
  const pts = rect(2000, 3000), a = area(pts);
  const r1 = estimateScale({ lengths: [{ p1: pts[0], p2: pts[1], lengthM: 20 }], areaPx: a });
  assert.equal(r1.method, "length"); near(r1.s, 0.01);
  const r2 = estimateScale({ lengths: [], areaPx: a, area: { valueM2: 600, chisekiChosa: false } });
  assert.equal(r2.method, "area"); near(r2.s, 0.01);
});
test("L-04(1): 判定表", () => {
  const pts = rect(2000, 3000), a = area(pts), len = [{ p1: pts[0], p2: pts[1], lengthM: 20 }];
  assert.equal(estimateScale({ lengths: [], areaPx: a }).code, "SCALE_NO_REFERENCE");
  assert.equal(estimateScale({ lengths: len, areaPx: a, area: { valueM2: 610, chisekiChosa: false } }).method, "length");
  const r = estimateScale({ lengths: len, areaPx: a, area: { valueM2: 610, chisekiChosa: true } });
  assert.equal(r.method, "area"); near(r.s, Math.sqrt(610 / a));
  assert.equal(estimateScale({ lengths: len, areaPx: a, area: { valueM2: null, chisekiChosa: true } }).method, "length");
});
test("L-04(4): 入力チェック", () => {
  assert.equal(estimateScale({ lengths: [{ p1: P(1, 1), p2: P(1.5, 1), lengthM: 5 }] }).code, "REF_SAME_POINT");
  assert.equal(estimateScale({ lengths: [{ p1: P(0, 0), p2: P(100, 0), lengthM: 0 }] }).code, "REF_NON_POSITIVE");
  assert.equal(estimateScale({ lengths: [{ p1: P(0, 0), p2: P(100, 0), lengthM: NaN }] }).code, "REF_NON_POSITIVE");
  assert.equal(estimateScale({ lengths: [], areaPx: 100, area: { valueM2: -3 } }).code, "REF_NON_POSITIVE");
});
test("L-04(3): 縦横別（sx=0.0100, sy=0.0103）が±0.1%以内で戻る。同じ向きだけなら推定できない", () => {
  const sx = 0.0100, sy = 0.0103;
  const pts = rect(2000, 3000);
  const ref = (p1, p2) => ({ p1, p2, lengthM: Math.hypot(sx * (p2.x - p1.x), sy * (p2.y - p1.y)) });
  const r = estimateScale({ lengths: [ref(pts[0], pts[1]), ref(pts[1], pts[2])], areaPx: area(pts), anisotropic: true });
  assert.ok(r.aniso.ok); near(r.sx, sx, sx * 0.001); near(r.sy, sy, sy * 0.001);
  const r2 = estimateScale({ lengths: [ref(pts[0], pts[1]), ref(pts[3], pts[2])], areaPx: area(pts), anisotropic: true });
  assert.equal(r2.aniso.ok, false); assert.equal(r2.aniso.code, "ANISO_INSUFFICIENT"); assert.ok(r2.warnings.includes("ANISO_INSUFFICIENT"));
  // 辺1本＋面積
  const A = area(pts) * sx * sy;
  const r3 = estimateScale({ lengths: [ref(pts[0], P(2000, 3000))], areaPx: area(pts), area: { valueM2: A, chisekiChosa: false }, anisotropic: true });
  assert.ok(r3.aniso.ok); near(r3.sx, sx, sx * 0.001); near(r3.sy, sy, sy * 0.001);
  // 地籍調査済み・面積固定・辺1本
  const r4 = estimateScale({ lengths: [ref(pts[0], pts[1])], areaPx: area(pts), area: { valueM2: A, chisekiChosa: true }, anisotropic: true });
  assert.ok(r4.aniso.ok); near(r4.sx, sx, sx * 0.001); near(r4.sy, sy, sy * 0.001);
});
test("L-04(2): 3本のうち1本だけ+5%の誤差 → その基準だけに印", () => {
  const pts = rect(2000, 3000), s = 0.01;
  const lengths = [[0, 1, 1], [1, 2, 1.05], [0, 2, 1]].map(([i, j, f], k) => ({ id: `r${k}`, p1: pts[i], p2: pts[j], lengthM: Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y) * s * f }));
  const r = estimateScale({ lengths, areaPx: area(pts) });
  assert.deepEqual(r.refs.filter((x) => x.flag).map((x) => x.id), ["r1"]);
});

// ---------- L-05 三角形への分割（T-005） ----------
const sumArea = (pts, tris) => tris.reduce((s, t) => s + area(t.map((i) => pts[i])), 0);
test("L-05: 凸六角形・L字・凹みの多い20角形", () => {
  const hex = [...Array(6).keys()].map((k) => P(Math.cos(k * Math.PI / 3) * 10, Math.sin(k * Math.PI / 3) * 10));
  const L = [P(0, 0), P(4, 0), P(4, 2), P(2, 2), P(2, 4), P(0, 4)];
  const gear = [...Array(20).keys()].map((k) => { const r = k % 2 ? 6 : 10; return P(Math.cos(k * Math.PI / 10) * r, Math.sin(k * Math.PI / 10) * r); });
  for (const pts of [hex, L, gear, [...L].reverse()]) {
    const t = triangulate(pts); assert.equal(t.length, pts.length - 2);
    near(sumArea(pts, t), area(pts), 1e-9 * area(pts)); assert.ok(trisValid(pts, t));
  }
});
test("L-05: 凹んだ頂点をまたぐ対角線を作らず、入れ替えできない場合は FLIP_NOT_CONVEX", () => {
  const L = [P(0, 0), P(4, 0), P(4, 2), P(2, 2), P(2, 4), P(0, 4)];
  const t = triangulate(L);
  for (const d of diagonals(t, 6)) assert.ok(!(d.a === 2 && d.b === 4) || false, "凹みをまたぐ 2-4 は作らない");
  // 凸でない四角形の対角線を探して入れ替えを試す
  const codes = diagonals(t, 6).map((d) => flip(L, t, d.a, d.b));
  assert.ok(codes.some((r) => r.code === "FLIP_NOT_CONVEX") || codes.every((r) => r.tris));
  for (const r of codes) if (r.tris) { assert.ok(trisValid(L, r.tris)); near(sumArea(L, r.tris), 12); }
  // 正方形は入れ替えできる
  const sq = rect(10, 10), ts = triangulate(sq), d = diagonals(ts, 4)[0];
  const f = flip(sq, ts, d.a, d.b); assert.ok(f.tris); assert.ok(trisValid(sq, f.tris));
  assert.notDeepEqual(diagonals(f.tris, 4).map((x) => [x.a, x.b]), [[d.a, d.b]]);
});

// ---------- L-06 三斜求積と端数処理（T-006） ----------
test("L-06: 底辺12.3456・高さ8.7649 → 12.35/8.76、倍面積108.1860", () => {
  const pts = [P(0, 0), P(12.3456, 0), P(6, 8.7649)];
  const r = sansha(pts, [[0, 1, 2]]);
  assert.equal(r.rows[0].bCm, 1235); assert.equal(r.rows[0].hCm, 876); assert.equal(cm2ToM2Text(r.T), "108.1860");
});
test("L-06: 12.345 は 12.35（浮動小数点で狂わない）", () => {
  assert.equal(toCm(12.345), 1235); assert.equal(toCm(1.005), 101); assert.equal(toCm(8.7649), 876);
});
test("L-06: 地目による切り捨て（規則100条）", () => {
  assert.equal(truncateArea(2 * 1234567, "宅地").text, "123.45");
  assert.equal(truncateArea(2 * 1234567, "山林").text, "123");
  assert.equal(truncateArea(2 * 95000, "山林").text, "9.50");
  assert.equal(truncateArea(2 * 100000, "山林").text, "10.00");
  assert.equal(truncateArea(2 * 100001, "山林").text, "10");
  assert.equal(truncateArea(2 * 1234567, "鉱泉地").text, "123.45");
  assert.equal(truncateArea(2469135, "宅地").text, "123.45"); // T/2 に 0.5 が出る場合
  assert.equal(truncateArea(100, "").code, "CHIMOKU_REQUIRED");
  assert.equal(CHIMOKU.length, 23);
});
test("L-06: 三斜の合計と座標法の差が丸めの範囲内", () => {
  const pts = [P(0, 0), P(23.456, 0), P(25.1, 14.77), P(12.2, 19.03), P(-1.4, 12.9)];
  const r = sansha(pts, triangulate(pts));
  assert.ok(Math.abs(r.diff) <= r.tolerance, `${r.diff} > ${r.tolerance}`);
});

// ---------- L-07 図面の縮尺・L-08 作成日（共通部品） ----------
test("L-07: 図面の縮尺の選び方", () => {
  const C = [100, 150, 200, 250, 300, 400, 500, 600, 1000, 1500, 2000, 2500, 5000];
  assert.equal(selectDrawingScale(20, 30, 180, 150, C).denominator, 200);
  const big = selectDrawingScale(2000, 1000, 180, 150, C); assert.equal(big.fixed, false);
});
test("L-08: JSTの0時・年末・うるう年", () => {
  assert.equal(todayJst(new Date("2026-11-21T14:59:59Z")), "2026-11-21");
  assert.equal(todayJst(new Date("2026-11-21T15:00:00Z")), "2026-11-22");
  assert.equal(todayJst(new Date("2026-12-31T15:00:00Z")), "2027-01-01");
  assert.equal(parseDateInput("2028/02/29").ymd, "2028-02-29");
  assert.equal(parseDateInput("2026/02/29").code, "DATE_INVALID");
  assert.equal(parseDateInput("２０２６１１２５").ymd, "2026-11-25");
});
