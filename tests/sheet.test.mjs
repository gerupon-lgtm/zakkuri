// T-014・T-023 図面（印刷用SVG）の中身
import test from "node:test";
import assert from "node:assert/strict";
import { compute } from "../src/core/compute.js";
import { buildSheet, referenceList } from "../src/ui/sheet.js";
import { alignAngle, rotate } from "../src/shared/rotate.js";
import { NOTICE } from "../src/ui/messages.js";

const s = 0.02; // m/px
function work(wM, hM, opt = {}) {
  const V = [[0, 0], [wM, 0], [wM, hM], [0, hM]].map(([x, y], i) => ({ id: `v${i}`, x: 100 + x / s, y: 100 + y / s }));
  return {
    image: { width: 4000, height: 4000 }, rectify: { enabled: false, paper: "unknown" }, vertices: V, closed: true, north: { x1: 50, y1: 300, x2: 50, y2: 100 },
    refs: { lengths: opt.areaOnly ? [] : [{ id: "r0", v1: "v0", v2: "v1", lengthM: wM }], area: { valueM2: opt.kobo ?? null, chisekiChosa: !!opt.chiseki } },
    chimoku: "宅地", anisotropic: false, triangles: null,
    drawing: { shozai: "三重県○○市", chiban: "123-4", officeName: "○○税理士法人", author: "田中", createdDate: "2026-11-26", paper: opt.paper ?? "A4", rotationDeg: opt.rot ?? 0, showBackground: false },
  };
}

test("T-014: 図面に必要な項目がそろう（C-03）", () => {
  const w = work(20, 30, { kobo: 610 }); const C = compute(w); const r = buildSheet(w, C);
  for (const t of ["現況図（概算）", "三重県○○市", "123-4", "宅地", "三斜求積表", "公簿面積", "610㎡", "概算面積", "差（概算−公簿）", "図面縮尺 1/", "公図の推定縮尺", "使った基準：辺1–2 20.00m", NOTICE, "2026/11/26", "田中", "○○税理士法人", "台形補正 なし"]) assert.ok(r.svg.includes(t), `「${t}」が図面にありません`);
  assert.ok(/rotate\(/.test(r.svg) && r.svg.includes(">N<"), "方位記号");
  assert.ok(!r.svg.includes("SIKUMI"), "図面にSIKUMI LABの表示を入れない");
});
test("T-014: 面積を基準にしたときは差の欄を出さず「面積基準」と書く", () => {
  const w = work(20, 30, { areaOnly: true, kobo: 600, chiseki: true }); const C = compute(w); const r = buildSheet(w, C);
  assert.equal(C.scale.method, "area"); assert.ok(r.svg.includes("面積基準で縮尺を算出")); assert.ok(!r.svg.includes("差（概算−公簿）"));
  assert.deepEqual(referenceList(w, C), ["公簿面積 600㎡（地籍調査済み）（差+0.0%）"]);
});
test("T-014: 図面縮尺の選び方（小さい・細長い・大きい土地、A3）", () => {
  const den = (w, h, p) => { const x = work(w, h, { paper: p }); return buildSheet(x, compute(x)).scale; };
  assert.equal(den(10, 8).denominator, 100);   // 小さい土地は1/100
  assert.equal(den(60, 4).denominator, 400);   // 細長い（描画幅約180mm → 60m は1/400）
  assert.equal(den(300, 200).denominator, 2000); // 描画範囲 約183×138mm
  assert.ok(den(60, 4, "A3").denominator < 400, "A3なら大きく描ける");
  const huge = den(2000, 1500); assert.equal(huge.fixed, false);
});
test("T-023: 長辺を水平にそろえると長辺が水平になり、三斜の値は変わらない", () => {
  const w = work(20, 30); w.vertices[1].y += 300; // 長方形を傾ける
  const C0 = compute(w); const i = 1; const a = C0.real[i], b = C0.real[i + 1];
  w.drawing.rotationDeg = alignAngle(a, b, "h");
  const p = rotate(a, w.drawing.rotationDeg), q = rotate(b, w.drawing.rotationDeg);
  assert.ok(Math.abs(p.y - q.y) < 1e-9, "水平になっていない");
  const C1 = compute(w); assert.equal(C1.sansha.T, C0.sansha.T);
  assert.ok(buildSheet(w, C1).svg.includes("現況図"));
});
