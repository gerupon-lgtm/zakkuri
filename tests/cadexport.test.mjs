// T-101・T-102 書き出したSIMA・DXFを、サクズの読み取り部品で読み戻して確かめる
import test from "node:test";
import assert from "node:assert/strict";
import { compute } from "../src/core/compute.js";
import { toSima, toDxf, surveyTransform, ORIGIN, LAYERS } from "../src/core/cadexport.js";
import { encodeSjis } from "../src/io/sjis.js";
import { parseSima, parseDxf, decodeText } from "../src/shared/importers.js";
import { area } from "../src/shared/geometry.js";

const s = 0.02;
function work(north) {
  const pts = [[0, 0], [20, 0], [20, 15], [10, 15], [10, 30], [0, 30]];
  return {
    image: { width: 4000, height: 4000 }, rectify: { enabled: false }, closed: true, north, chimoku: "宅地", anisotropic: false, triangles: null,
    vertices: pts.map(([x, y], i) => ({ id: `v${i}`, x: 100 + x / s, y: 100 + y / s })),
    refs: { lengths: [{ id: "r", v1: "v0", v2: "v1", lengthM: 20 }], area: { valueM2: 450, chisekiChosa: false } },
    drawing: { shozai: "三重県桑名市○○町", chiban: "123番4", createdDate: "2026-11-26", paper: "A4", rotationDeg: 0 },
  };
}

test("T-101: 北が画像の上なら X＝上向き・Y＝右向き、頂点1が原点", () => {
  const C = compute(work(null)); const S = surveyTransform(C.real, null);
  assert.deepEqual(S(C.real[0]), { X: ORIGIN.X, Y: ORIGIN.Y });
  const p = S(C.real[1]); assert.ok(Math.abs(p.Y - (ORIGIN.Y + 20)) < 1e-9 && Math.abs(p.X - ORIGIN.X) < 1e-9, "辺1–2は東向き");
  const q = S(C.real[5]); assert.ok(Math.abs(q.X - (ORIGIN.X - 30)) < 1e-9, "画像の下は南");
});
test("T-101: 北を右に指定すると、画像の右が X（北）になる", () => {
  const C = compute(work({ x1: 0, y1: 0, x2: 100, y2: 0 })); const S = surveyTransform(C.real, C.northReal);
  const p = S(C.real[1]); assert.ok(Math.abs(p.X - (ORIGIN.X + 20)) < 1e-9 && Math.abs(p.Y - ORIGIN.Y) < 1e-9);
});
test("T-101: SIMA を Shift_JIS で書き、サクズの読み取りで読み戻すと、点・区画・面積が一致する", () => {
  const w = work(null), C = compute(w);
  const bytes = encodeSjis(toSima(w, C));
  const { text, encoding } = decodeText(bytes); assert.equal(encoding, "shift_jis");
  const r = parseSima(text);
  assert.equal(r.points.length, 6); assert.equal(r.points[0].name, "1");
  assert.equal(r.polylines.length, 1); assert.equal(r.polylines[0].name, "123番4");
  assert.ok(Math.abs(area(r.polylines[0].pts) - 450) < 1e-6);
  assert.ok(text.startsWith("G00,01,三重県桑名市○○町,"));
});
test("T-102: DXF（R12）を読み戻すと、外周が閉じた線で面積が一致し、レイヤーがそろう", () => {
  const w = work({ x1: 0, y1: 0, x2: 70, y2: -70 }), C = compute(w); // 北を斜めに指定しても面積は同じ
  const dxf = toDxf(w, C, 250);
  const { text } = decodeText(encodeSjis(dxf));
  const r = parseDxf(text);
  const outline = r.polylines.filter((p) => p.layer === LAYERS.outline);
  assert.equal(outline.length, 1); assert.ok(outline[0].closed); assert.equal(outline[0].pts.length, 6);
  assert.ok(Math.abs(area(outline[0].pts) - 450) < 0.01); // 座標をmmで丸めた分の差だけ
  assert.equal(r.polylines.filter((p) => p.layer === LAYERS.diag).length, 3);  // 6角形の対角線は3本
  assert.equal(r.polylines.filter((p) => p.layer === LAYERS.height).length, 4); // 三角形4つの高さ
  assert.equal(r.unitHint, "m");
  assert.ok(text.includes("AC1009") && text.includes("ANSI_932") && text.includes("測量成果ではありません"));
  assert.match(r.warnings.join(), /TEXT/); // 文字は TEXT で書いている
});
