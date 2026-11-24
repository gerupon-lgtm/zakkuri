// T-020 受入基準1〜3（計算部分）: 合成画像の答えから、補正 → 頂点 → 基準 → 面積 を通す
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compute } from "../src/core/compute.js";

const A = JSON.parse(readFileSync(new URL("./images/answers.json", import.meta.url)));
const work = (ans, rectify) => ({
  image: { width: 2000, height: 2400 }, rectify, closed: true, chimoku: "宅地", anisotropic: false, triangles: null,
  vertices: ans.vertices.map((p, i) => ({ id: `v${i}`, ...p })),
  refs: { lengths: [{ id: "r0", v1: "v0", v2: "v1", lengthM: ans.edge0M }], area: { valueM2: null, chisekiChosa: false } },
});
const within = (v, t, pct) => assert.ok(Math.abs(v / t - 1) * 100 <= pct, `${v} は ${t} の±${pct}%を超えています`);

test("受入: スキャンの長方形・辺1本 → 600㎡（±2%）", () => {
  const c = compute(work(A["rect-scan.png"], { enabled: false }));
  within(c.approxM2, 600, 2); assert.equal(c.chiseki.text, "600.03"); // 三斜の丸め（底辺・高さをcmで四捨五入）による差
});
test("受入: L字形 → 450㎡（±2%）・三角形4つ", () => {
  const c = compute(work(A["l-scan.png"], { enabled: false }));
  within(c.approxM2, 450, 2); assert.equal(c.tris.length, 4);
});
test("受入: 斜めに撮った長方形 → 補正して600㎡（±2%）。補正しないと外れる", () => {
  const a = A["rect-photo.png"];
  const on = compute(work(a, { enabled: true, corners: a.corners, paper: a.paper, orientation: a.orientation }));
  within(on.approxM2, 600, 2);
  assert.ok(Math.abs(on.paperDen - 1 / (297 / 1980) * 0.02 * 1000) < 1, `推定縮尺 ${on.paperDen}`); // 1/約133
  const off = compute(work(a, { enabled: false }));
  assert.ok(Math.abs(off.approxM2 / 600 - 1) > 0.02, "補正なしでは±2%に入らないはず");
});
test("受入: 面積だけで縮尺を出すと、面積はそのまま", () => {
  const w = work(A["rect-scan.png"], { enabled: false }); w.refs.lengths = []; w.refs.area = { valueM2: 600, chisekiChosa: false };
  const c = compute(w); assert.equal(c.scale.method, "area"); within(c.approxM2, 600, 0.1); assert.equal(c.compare, undefined);
});
