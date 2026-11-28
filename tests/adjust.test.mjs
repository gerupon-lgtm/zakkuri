// L-10 入力した長さに合わせた頂点の調整（F-019）
import test from "node:test";
import assert from "node:assert/strict";
import { adjustToLengths } from "../src/core/adjust.js";
import { compute } from "../src/core/compute.js";
import { area } from "../src/shared/geometry.js";

const P = (x, y) => ({ x, y });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("少しずれた長方形（20.1×29.8）を 20×30 に合わせると、辺が入力値どおりで面積は約600", () => {
  const p0 = [P(0, 0), P(20.1, 0), P(20.1, 29.8), P(0, 29.8)];
  const r = adjustToLengths(p0, [{ i: 0, j: 1, L: 20 }, { i: 1, j: 2, L: 30 }, { i: 2, j: 3, L: 20 }, { i: 3, j: 0, L: 30 }]);
  assert.equal(r.code, undefined);
  for (const [i, j, L] of [[0, 1, 20], [1, 2, 30], [2, 3, 20], [3, 0, 30]]) assert.ok(Math.abs(dist(r.pts[i], r.pts[j]) - L) < 0.0005);
  assert.ok(Math.abs(area(r.pts) - 600) < 0.01, `${area(r.pts)}`); // 直角は画像の形から保たれる
  assert.ok(r.maxMove < 0.2);
});
test("対角線も入れると、形が決まる（画像が傾いていても）", () => {
  const p0 = [P(0, 0), P(20, 0), P(21, 30), P(1, 30)]; // 画像では平行四辺形気味
  const r = adjustToLengths(p0, [{ i: 0, j: 1, L: 20 }, { i: 1, j: 2, L: 30 }, { i: 2, j: 3, L: 20 }, { i: 3, j: 0, L: 30 }, { i: 0, j: 2, L: Math.hypot(20, 30) }]);
  assert.ok(Math.abs(area(r.pts) - 600) < 0.01, `${area(r.pts)}`);
});
test("あり得ない長さ（三角形 1・1・5）は ADJUST_INCONSISTENT", () => {
  const r = adjustToLengths([P(0, 0), P(1, 0), P(0.5, 0.8)], [{ i: 0, j: 1, L: 1 }, { i: 1, j: 2, L: 1 }, { i: 2, j: 0, L: 5 }]);
  assert.equal(r.code, "ADJUST_INCONSISTENT");
});
test("compute: 求積に使う長さの切り替え。入力モードでは辺長が入力値になり、画像モードは今までどおり", () => {
  const s = 0.02, pts = [[0, 0], [5, 0], [5, 2], [8, 2], [8, 7], [5, 7], [5, 8], [0, 8]];
  const L = [5, 2, 3, 5, 3, 1, 5, 8];
  const jit = [[0.4, -0.3], [0, 0.2], [-0.3, 0], [0.2, 0.3], [0, -0.4], [0.3, 0], [-0.2, 0.2], [0, 0]]; // 頂点を置いた位置のずれ（px）
  const w = { image: { width: 1000, height: 1000 }, rectify: { enabled: false }, closed: true, chimoku: "宅地", anisotropic: false, triangles: null,
    vertices: pts.map(([x, y], i) => ({ id: `v${i}`, x: 50 + x / s + jit[i][0], y: 50 + y / s + jit[i][1] })),
    refs: { lengths: L.map((l, i) => ({ id: `r${i}`, v1: `v${i}`, v2: `v${(i + 1) % 8}`, lengthM: l })), area: { valueM2: null } }, drawing: {} };
  const img = compute(w);
  assert.ok(img.edgeLen.some((e, i) => Math.abs(e - L[i]) > 0.002), "画像モードでは入力値とずれる");
  w.lengthMode = "input"; const inp = compute(w);
  assert.ok(inp.adjust && !inp.adjust.code);
  inp.edgeLen.forEach((e, i) => assert.ok(Math.abs(e - L[i]) < 0.0005, `辺${i + 1}: ${e}`));
  assert.ok(Math.abs(inp.sansha.coordArea - 55) < 0.05, `${inp.sansha.coordArea}`);
});
