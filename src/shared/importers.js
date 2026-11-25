// サクズ（gerupon-lgtm/sakuzu）SZ-0.5.0 の src/shared/importers.js をコピーしたもの（C-05b: 案A。ざっくり地積では、書き出したSIMA・DXFを読み戻して確かめるテストに使う）
// ファイルの読み取り（SIMA・CSV・DXF）。アプリ固有の処理を持たない（C-04b）。
// 出力はすべて数学の向き（x 右、y 上）で、ファイルの単位のまま。
//   { points: [{ name, x, y, line }], polylines: [{ pts: [{ x, y, name? }], closed, layer? }], warnings: [], layers?: [...], unitHint? }
// 読めないときは ImportError を投げる（code と、分かれば行番号）。

export class ImportError extends Error {
  constructor(code, message, line = null) { super(message); this.code = code; this.line = line; }
}

/** 文字コード: auto は UTF-8 で読み、壊れていれば Shift_JIS で読む */
export function decodeText(buf, enc = "auto") {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (!bytes.length) throw new ImportError("empty", "ファイルが空です");
  const dec = (e, fatal) => new TextDecoder(e, { fatal }).decode(bytes);
  let text, used;
  if (enc === "utf-8" || enc === "shift_jis") { text = dec(enc, false); used = enc; }
  else { try { text = dec("utf-8", true); used = "utf-8"; } catch { text = dec("shift_jis", false); used = "shift_jis"; } }
  return { text: text.replace(/^﻿/, ""), encoding: used };
}

const toNum = (s) => { const v = Number(String(s ?? "").trim()); return String(s ?? "").trim() !== "" && Number.isFinite(v) ? v : NaN; };
const splitLines = (text) => text.split(/\r\n|\r|\n/);

/** SIMA（共通フォーマット）。A01 の座標と、D00〜D99 の区画。X は北・Y は東なので、x=Y・y=X に入れ替える */
export function parseSima(text) {
  const points = [], polylines = [], warnings = [];
  const byNo = new Map(), byName = new Map();
  let block = null;
  splitLines(text).forEach((raw, i) => {
    const line = i + 1, f = raw.split(",").map((s) => s.trim());
    const code = f[0];
    if (code === "A01") {
      const X = toNum(f[3]), Y = toNum(f[4]);
      if (!Number.isFinite(X) || !Number.isFinite(Y)) throw new ImportError("badNumber", `${line}行目の座標が数値ではありません`, line);
      const p = { name: f[2] || f[1] || `#${line}`, x: Y, y: X, line };
      points.push(p); if (f[1]) byNo.set(f[1], p); if (p.name) byName.set(p.name, p);
    } else if (code === "D00") { block = { name: f[2] || f[1] || "", refs: [], line }; }
    else if (code === "B01" && block) { block.refs.push({ no: f[1], name: f[2], line }); }
    else if (code === "D99" && block) {
      const pts = [];
      for (const r of block.refs) {
        const p = byNo.get(r.no) ?? byName.get(r.name);
        if (!p) { warnings.push(`${r.line}行目: 区画「${block.name}」の点（${r.name || r.no}）が座標にありません`); continue; }
        pts.push({ x: p.x, y: p.y, name: p.name });
      }
      if (pts.length >= 3) polylines.push({ pts, closed: true, name: block.name });
      else warnings.push(`${block.line}行目: 区画「${block.name}」は点が3つ未満のため、線にしませんでした`);
      block = null;
    }
  });
  if (!points.length) throw new ImportError("noPoints", "座標（A01）が1つもありません。SIMAの座標ファイルか確認してください");
  return { points, polylines, warnings };
}

/** CSVを表にする（区切りはカンマかタブ。ダブルクォート対応） */
export function csvRows(text) {
  const first = splitLines(text).find((l) => l.trim()) ?? "";
  const sep = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? "\t" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** 列の推測: 数値でない列を点名、残りの最初の2列を X・Y とする。見出し行は1行目に数値がないとき */
export function guessCsv(rows) {
  const r0 = rows[0] ?? [], body = rows.length > 1 && r0.every((c) => !Number.isFinite(toNum(c))) ? rows.slice(1) : rows;
  const header = body !== rows;
  const n = Math.max(...rows.map((r) => r.length), 0);
  const numeric = [...Array(n).keys()].filter((c) => body.slice(0, 20).every((r) => Number.isFinite(toNum(r[c]))));
  const nameCol = [...Array(n).keys()].find((c) => !numeric.includes(c)) ?? -1;
  let xCol = numeric[0] ?? 0, yCol = numeric[1] ?? 1;
  if (header) { // 見出しに X・Y があればそれに従う
    const hx = r0.findIndex((h) => /^x/i.test(h)), hy = r0.findIndex((h) => /^y/i.test(h));
    if (hx >= 0 && hy >= 0) { xCol = hx; yCol = hy; }
  }
  return { header, nameCol, xCol, yCol, axis: "survey" };
}

/** CSV。axis: survey（X北・Y東）または math（x右・y上） */
export function parseCsv(text, opt) {
  const rows = csvRows(text); if (!rows.length) throw new ImportError("empty", "ファイルが空です");
  const o = { ...guessCsv(rows), ...opt };
  const points = [];
  rows.forEach((r, i) => {
    if (o.header && i === 0) return;
    const X = toNum(r[o.xCol]), Y = toNum(r[o.yCol]);
    if (!Number.isFinite(X) || !Number.isFinite(Y)) throw new ImportError("badNumber", `${i + 1}行目のX・Yが数値ではありません（列の指定と見出し行を確認してください）`, i + 1);
    const name = o.nameCol >= 0 ? (r[o.nameCol] ?? "") : "";
    points.push(o.axis === "math" ? { name, x: X, y: Y, line: i + 1 } : { name, x: Y, y: X, line: i + 1 });
  });
  if (!points.length) throw new ImportError("noPoints", "点が1つもありません");
  return { points, polylines: [], warnings: [] };
}

/** DXF（ASCII）。LINE・LWPOLYLINE・POLYLINE・POINT。円・円弧・文字・寸法・ブロックは数えて知らせるだけ */
export function parseDxf(text, opt = {}) {
  if (/^AutoCAD Binary DXF/.test(text)) throw new ImportError("binary", "バイナリ形式のDXFは読めません。ASCII形式で保存し直してください");
  const L = splitLines(text), pairs = [];
  for (let i = 0; i + 1 < L.length; i += 2) {
    const code = parseInt(L[i].trim(), 10);
    if (!Number.isFinite(code)) throw new ImportError("format", `${i + 1}行目: DXFの形式ではありません`, i + 1);
    pairs.push({ code, v: L[i + 1].trim(), line: i + 2 });
  }
  const UNITS = { 4: "mm", 5: "cm", 6: "m" };
  let unitHint = null, sec = null;
  const ents = []; let cur = null;
  for (let k = 0; k < pairs.length; k++) {
    const { code, v } = pairs[k];
    if (code === 0 && v === "SECTION") { sec = pairs[k + 1]?.v; continue; }
    if (code === 0 && v === "ENDSEC") { sec = null; cur = null; continue; }
    if (sec === "HEADER" && code === 9 && v === "$INSUNITS") { unitHint = UNITS[+pairs[k + 1]?.v] ?? null; continue; }
    if (sec !== "ENTITIES") continue;
    if (code === 0) { cur = { type: v, layer: "0", xs: [], ys: [], flags: 0, line: pairs[k].line }; ents.push(cur); continue; }
    if (!cur) continue;
    if (code === 8) cur.layer = v;
    else if (code === 70) cur.flags = +v;
    else if (code === 10) cur.xs.push(+v);
    else if (code === 20) cur.ys.push(+v);
    else if (code === 11) cur.x2 = +v;
    else if (code === 21) cur.y2 = +v;
  }
  if (sec === undefined && !ents.length) throw new ImportError("format", "DXFの形式ではありません");
  const want = (e) => !opt.layers || opt.layers.includes(e.layer);
  const points = [], polylines = [], skipped = {}, layers = new Set();
  const P = (e, i) => ({ x: e.xs[i], y: e.ys[i] });
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (["LINE", "LWPOLYLINE", "POLYLINE", "POINT"].includes(e.type)) layers.add(e.layer);
    if (e.type === "LINE") { if (want(e)) polylines.push({ pts: [P(e, 0), { x: e.x2, y: e.y2 }], closed: false, layer: e.layer }); }
    else if (e.type === "LWPOLYLINE") { if (want(e)) polylines.push({ pts: e.xs.map((_, j) => P(e, j)), closed: (e.flags & 1) === 1, layer: e.layer }); }
    else if (e.type === "POLYLINE") {
      const pts = []; let j = i + 1;
      for (; j < ents.length && ents[j].type === "VERTEX"; j++) pts.push(P(ents[j], 0));
      if (want(e)) polylines.push({ pts, closed: (e.flags & 1) === 1, layer: e.layer });
      i = j; // SEQEND を飛ばす
    } else if (e.type === "POINT") { if (want(e)) points.push({ name: "", x: e.xs[0], y: e.ys[0], line: e.line }); }
    else if (!["VERTEX", "SEQEND"].includes(e.type)) skipped[e.type] = (skipped[e.type] || 0) + 1;
  }
  for (const pl of polylines) if (pl.pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new ImportError("badNumber", "座標が数値でない図形があります");
  const warnings = Object.keys(skipped).length ? [`取り込まなかった図形: ${Object.entries(skipped).map(([k, n]) => `${k} ${n}個`).join("、")}`] : [];
  if (!points.length && !polylines.some((p) => p.pts.length)) throw new ImportError("noPoints", "取り込める線や点がありません（線・ポリライン・点だけを取り込みます）");
  return { points, polylines, warnings, layers: [...layers].sort(), unitHint };
}

/** 拡張子から形式を決める */
export function formatOf(fileName) {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  return ext === "sim" || ext === "sima" ? "sima" : ext === "csv" || ext === "txt" || ext === "tsv" ? "csv" : ext === "dxf" ? "dxf" : null;
}
