// T-101・T-102 SIMA・DXF の書き出し（F-013・F-014）。DOMに触らない純粋な関数（文字列を返す。文字コードの変換は io/sjis.js）
// 細かな仕様は要件定義書20章 No.6・7 で発案者に確認する。それまでは次の【想定】で作る:
//  - 座標は任意座標。X＝北・Y＝東（測量の座標系）。北を指定していなければ、画像の上を北とする
//  - 頂点1を原点 (X, Y) = (1000.000, 1000.000) に置く（負の座標を避けるため）
//  - 点名は頂点の番号（1, 2, …）。区画名は地番（なければ「区画1」）
//  - DXF は R12（AC1009）の ASCII 形式。単位は m。寸法は TEXT（文字）で書く。レイヤー名は英字
import { cmText, cm2ToM2Text } from "./sansha.js";
import { diagonals } from "./triangulate.js";

export const ORIGIN = { X: 1000, Y: 1000 }; // 【想定】
export const LAYERS = { outline: "ZK_OUTLINE", diag: "ZK_SANSHA", height: "ZK_HEIGHT", dim: "ZK_DIM", no: "ZK_NUMBER", text: "ZK_TEXT" }; // 【想定】

const f3 = (v) => (Math.round(v * 1000) / 1000).toFixed(3);

/**
 * 実座標（m、x右・y下）を測量座標（X北・Y東）にする。
 * @param {{x,y}[]} real 実座標
 * @param {{x,y}|null} northReal 北の向き（実座標でのベクトル）。null なら画像の上（0,-1）
 * @returns {(p:{x,y}) => {X:number, Y:number}}
 */
export function surveyTransform(real, northReal) {
  let n = northReal && Math.hypot(northReal.x, northReal.y) > 0 ? northReal : { x: 0, y: -1 };
  const L = Math.hypot(n.x, n.y); n = { x: n.x / L, y: n.y / L };
  const e = { x: -n.y, y: n.x }; // 北を時計回りに90°回した向き＝東（y が下向きの座標）
  const o = real[0];
  return (p) => { const dx = p.x - o.x, dy = p.y - o.y; return { X: ORIGIN.X + dx * n.x + dy * n.y, Y: ORIGIN.Y + dx * e.x + dy * e.y }; };
}

/** SIMA（共通フォーマット）の文字列。改行は CRLF */
export function toSima(work, C) {
  const S = surveyTransform(C.real, C.northReal);
  const name = work.drawing.chiban || "区画1";
  const L = [`G00,01,${clean(work.drawing.shozai || "ざっくり地積")},`, "Z00,座標ﾃﾞｰﾀ,", "A00,"];
  C.real.forEach((p, i) => { const q = S(p); L.push(`A01,${i + 1},${i + 1},${f3(q.X)},${f3(q.Y)},0.000,`); });
  L.push("A99,", "Z00,区画ﾃﾞｰﾀ,", `D00,1,${clean(name)},1,`);
  C.real.forEach((_, i) => L.push(`B01,${i + 1},${i + 1},`));
  L.push("D99,", "A99,END,");
  return L.join("\r\n") + "\r\n";
}
const clean = (s) => String(s).replace(/[,\r\n]/g, " ").trim();

/** DXF（R12・ASCII）の文字列 */
export function toDxf(work, C, drawingDen = 250) {
  const S = surveyTransform(C.real, C.northReal);
  const P = C.real.map((p) => { const q = S(p); return { x: q.Y, y: q.X }; }); // DXF は x右（東）・y上（北）
  const T = (p) => { const q = S(p); return { x: q.Y, y: q.X }; };
  const th = 0.0025 * drawingDen; // 図面上 2.5mm 相当の文字高さ（m）
  const out = [];
  const g = (code, v) => out.push(String(code), String(v));
  const line = (layer, a, b) => { g(0, "LINE"); g(8, layer); g(10, f3(a.x)); g(20, f3(a.y)); g(30, "0.0"); g(11, f3(b.x)); g(21, f3(b.y)); g(31, "0.0"); };
  const text = (layer, p, h, s, rotDeg = 0, center = true) => {
    g(0, "TEXT"); g(8, layer); g(10, f3(p.x)); g(20, f3(p.y)); g(30, "0.0"); g(40, f3(h)); g(1, s);
    if (rotDeg) g(50, f3(rotDeg));
    if (center) { g(72, 1); g(73, 2); g(11, f3(p.x)); g(21, f3(p.y)); g(31, "0.0"); }
  };
  // HEADER
  g(0, "SECTION"); g(2, "HEADER"); g(9, "$ACADVER"); g(1, "AC1009"); g(9, "$DWGCODEPAGE"); g(3, "ANSI_932"); g(9, "$INSUNITS"); g(70, 6); g(0, "ENDSEC");
  // TABLES（レイヤー）
  g(0, "SECTION"); g(2, "TABLES"); g(0, "TABLE"); g(2, "LAYER"); g(70, Object.keys(LAYERS).length);
  const colors = { outline: 7, diag: 5, height: 30, dim: 7, no: 3, text: 7 };
  for (const [k, name] of Object.entries(LAYERS)) { g(0, "LAYER"); g(2, name); g(70, 0); g(62, colors[k]); g(6, "CONTINUOUS"); }
  g(0, "ENDTAB"); g(0, "ENDSEC");
  // ENTITIES
  g(0, "SECTION"); g(2, "ENTITIES");
  const n = P.length;
  // 外周（閉じたポリライン）
  g(0, "POLYLINE"); g(8, LAYERS.outline); g(66, 1); g(10, "0.0"); g(20, "0.0"); g(30, "0.0"); g(70, 1);
  for (const p of P) { g(0, "VERTEX"); g(8, LAYERS.outline); g(10, f3(p.x)); g(20, f3(p.y)); g(30, "0.0"); }
  g(0, "SEQEND"); g(8, LAYERS.outline);
  // 三斜の線と高さ
  for (const d of diagonals(C.tris, n)) line(LAYERS.diag, P[d.a], P[d.b]);
  for (const r of C.sansha.rows) line(LAYERS.height, P[r.apex], T(r.foot));
  // 辺の長さ（辺の中点の外側）・頂点番号・三角形番号
  const sgn = Math.sign(P.reduce((s, p, i) => { const q = P[(i + 1) % n]; return s + p.x * q.y - q.x * p.y; }, 0)) || 1;
  P.forEach((a, i) => {
    const b = P[(i + 1) % n], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-9) return;
    const nx = (b.y - a.y) / L * sgn, ny = -(b.x - a.x) / L * sgn; // 外向き（反時計回りなら右側）
    let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    text(LAYERS.dim, { x: (a.x + b.x) / 2 + nx * th, y: (a.y + b.y) / 2 + ny * th }, th, (Math.round(C.edgeLen[i] * 100) / 100).toFixed(2), ang);
  });
  const cx = P.reduce((s, p) => s + p.x, 0) / n, cy = P.reduce((s, p) => s + p.y, 0) / n;
  P.forEach((p, i) => { const vx = p.x - cx, vy = p.y - cy, L = Math.hypot(vx, vy) || 1; text(LAYERS.no, { x: p.x + vx / L * th * 1.5, y: p.y + vy / L * th * 1.5 }, th * 0.9, String(i + 1)); });
  for (const r of C.sansha.rows) { const c = r.tri.map((i) => P[i]).reduce((s, p) => ({ x: s.x + p.x / 3, y: s.y + p.y / 3 }), { x: 0, y: 0 }); text(LAYERS.no, c, th, `(${r.no})`); }
  // 文字（題名・面積・注意書き）: 図の下に置く
  const minY = Math.min(...P.map((p) => p.y)), minX = Math.min(...P.map((p) => p.x));
  const lines = [
    `現況図（概算） 所在 ${work.drawing.shozai || "-"} 地番 ${work.drawing.chiban || "-"} 地目 ${work.chimoku || "-"}`,
    `概算面積 ${C.chiseki.text ?? "-"}㎡（倍面積の合計 ${cm2ToM2Text(C.sansha.T)}㎡）${work.refs.area.valueM2 ? ` 公簿面積 ${work.refs.area.valueM2}㎡` : ""}`,
    ...C.sansha.rows.map((r) => `(${r.no}) 底辺 ${cmText(r.bCm)} × 高さ ${cmText(r.hCm)} = ${cm2ToM2Text(r.double)}`),
    "※公図等から推定した概算であり、測量成果ではありません",
  ];
  lines.forEach((s, i) => text(LAYERS.text, { x: minX, y: minY - th * (4 + i * 1.8) }, th, s, 0, false));
  g(0, "ENDSEC"); g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}
