// 図面（印刷用）のSVGを作る（F-010・F-017・C-03）。DOMに触らないので node --test で中身を確かめられる
// 座標は実座標（m、x右・y下）。回転は見た目だけ（F-017。頂点の座標は変えない）
import { rotate, readableDeg } from "../shared/rotate.js";
import { paperSize, selectDrawingScale } from "../shared/print.js";
import { formatLength, formatArea, roundHalfUp } from "../shared/round.js";
import { formatYmd } from "../shared/date.js";
import { cmText, cm2ToM2Text } from "../core/sansha.js";
import { diagonals } from "../core/triangulate.js";
import { NOTICE } from "./messages.js";

export const SCALES = [100, 150, 200, 250, 300, 400, 500, 600, 1000, 1500, 2000, 2500, 5000]; // L-07【想定】
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (p) => `${p >= 0 ? "+" : ""}${roundHalfUp(p, 1).toFixed(1)}%`;

/** 使った基準の一覧（図面の下に書く文字列の配列） */
export function referenceList(work, C) {
  const sc = C.scale, out = [];
  const n = work.vertices.length, idx = (id) => work.vertices.findIndex((v) => v.id === id);
  let k = 0;
  for (const r of work.refs.lengths) {
    const f = sc.refs.find((x) => x.id === r.id); if (!f) continue;
    const i = r.v1 ? idx(r.v1) : -1, j = r.v2 ? idx(r.v2) : -1;
    const isEdge = i >= 0 && j >= 0 && ((i + 1) % n === j || (j + 1) % n === i);
    const name = isEdge ? `辺${Math.min(i, j) === 0 && Math.max(i, j) === n - 1 ? `${n}–1` : `${Math.min(i, j) + 1}–${Math.max(i, j) + 1}`}` : `基準${++k}`;
    out.push(`${name} ${formatLength(r.lengthM)}m（差${pct(f.diffPct)}）`);
  }
  const a = sc.refs.find((x) => x.kind === "area");
  if (a) out.push(`公簿面積 ${a.valueM2}㎡${work.refs.area.chisekiChosa ? "（地籍調査済み）" : ""}（差${pct(a.diffPct)}）`);
  return out;
}

/**
 * @param {object} work 作業データ
 * @param {object} C compute() の結果（C.sansha があること）
 * @param {{href:string, w:number, h:number, ax:number, ay:number}|null} bg 背景画像（画像1pxあたりの実寸 m）
 */
export function buildSheet(work, C, bg = null) {
  const d = work.drawing, rot = d.rotationDeg || 0;
  const { w: W, h: H } = paperSize(d.paper === "A3" ? "A3" : "A4", "landscape");
  const M = 10, HEAD = 11, FOOT = 27, TW = d.paper === "A3" ? 92 : 80, PAD = 7;
  const area = { x: M + PAD, y: M + HEAD + PAD, w: W - 2 * M - TW - 2 * PAD, h: H - 2 * M - HEAD - FOOT - 2 * PAD };
  const real = C.real, n = real.length, R = (p) => rotate(p, rot);
  const rp = real.map(R), xs = rp.map((p) => p.x), ys = rp.map((p) => p.y);
  const bw = Math.max(...xs) - Math.min(...xs) || 1, bh = Math.max(...ys) - Math.min(...ys) || 1;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const sc = selectDrawingScale(bw, bh, area.w, area.h, SCALES);
  const k = 1000 / sc.denominator; // 図面上の mm / 実寸 m
  const ox = area.x + area.w / 2, oy = area.y + area.h / 2;
  const T = (p) => { const q = R(p); return { x: ox + (q.x - cx) * k, y: oy + (q.y - cy) * k }; };
  const P = real.map(T);
  let g = "";
  // 背景（公図の画像。切り替え）
  if (bg) {
    const r = rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const m = [bg.ax * c * k, bg.ax * s * k, -bg.ay * s * k, bg.ay * c * k, ox - cx * k, oy - cy * k];
    g += `<g clip-path="url(#drawClip)"><image href="${bg.href}" width="${bg.w}" height="${bg.h}" preserveAspectRatio="none" opacity="0.35" transform="matrix(${m.map((v) => +v.toFixed(6)).join(" ")})"/></g>`;
  }
  // 三斜の線（対角線）と高さ
  for (const dg of diagonals(C.tris, n)) g += `<line x1="${P[dg.a].x}" y1="${P[dg.a].y}" x2="${P[dg.b].x}" y2="${P[dg.b].y}" stroke="#000" stroke-width="0.25" stroke-dasharray="1.6 1"/>`;
  for (const r of C.sansha.rows) { const a = P[r.apex], f = T(r.foot); g += `<line x1="${a.x}" y1="${a.y}" x2="${f.x}" y2="${f.y}" stroke="#000" stroke-width="0.18" stroke-dasharray="0.6 0.6"/>`; }
  // 外周
  g += `<polygon points="${P.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="#000" stroke-width="0.6"/>`;
  // 辺の長さ（外側に）。基準に使った辺は太字
  const sgn = Math.sign(P.reduce((s, p, i) => { const q = P[(i + 1) % n]; return s + p.x * q.y - q.x * p.y; }, 0)) || 1;
  const refEdge = new Set(work.refs.lengths.filter((r) => r.v1 && r.v2).map((r) => [r.v1, r.v2].sort().join("|")));
  P.forEach((a, i) => {
    const b = P[(i + 1) % n], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1e-6) return;
    const nx = (b.y - a.y) / L * sgn, ny = -(b.x - a.x) / L * sgn; // 外向きの法線
    const m = { x: (a.x + b.x) / 2 + nx * 2.6, y: (a.y + b.y) / 2 + ny * 2.6 };
    const ang = readableDeg(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI);
    const bold = refEdge.has([work.vertices[i].id, work.vertices[(i + 1) % n].id].sort().join("|"));
    g += `<text x="${m.x}" y="${m.y}" font-size="2.6" ${bold ? 'font-weight="700"' : ""} text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang} ${m.x} ${m.y})" stroke="#fff" stroke-width="0.7" paint-order="stroke">${formatLength(C.edgeLen[i])}</text>`;
  });
  // 頂点の番号
  const cen = { x: P.reduce((s, p) => s + p.x, 0) / n, y: P.reduce((s, p) => s + p.y, 0) / n };
  P.forEach((p, i) => { const vx = p.x - cen.x, vy = p.y - cen.y, L = Math.hypot(vx, vy) || 1; const q = { x: p.x + vx / L * 3, y: p.y + vy / L * 3 };
    g += `<circle cx="${p.x}" cy="${p.y}" r="0.5" fill="#000"/><text x="${q.x}" y="${q.y}" font-size="2.3" text-anchor="middle" dominant-baseline="middle" fill="#444">${i + 1}</text>`; });
  // 三角形の番号
  for (const r of C.sansha.rows) { const c = r.tri.map((i) => P[i]).reduce((s, p) => ({ x: s.x + p.x / 3, y: s.y + p.y / 3 }), { x: 0, y: 0 });
    g += `<circle cx="${c.x}" cy="${c.y}" r="2" fill="#fff" stroke="#000" stroke-width="0.2"/><text x="${c.x}" y="${c.y}" font-size="2.4" text-anchor="middle" dominant-baseline="central">${r.no}</text>`; }
  // 方位記号（北の向き + 図面の回転）
  const nx0 = area.x + area.w - 8, ny0 = area.y + 9;
  if (C.northReal) { const v = rotate(C.northReal, rot); const deg = Math.atan2(v.x, -v.y) * 180 / Math.PI; g += northSvg(nx0, ny0, deg, 9); }
  else g += `<text x="${nx0}" y="${ny0}" font-size="2.6" text-anchor="middle">方位 未指定</text>`;

  // 右の表（三斜求積表と面積）
  const x0 = W - M - TW, y0 = M + HEAD, tH = H - 2 * M - HEAD - FOOT;
  const rows = C.sansha.rows, rh = Math.min(4.6, (tH - 62) / Math.max(rows.length, 1)), fs = Math.min(2.8, rh * 0.62);
  const col = [x0 + 3, x0 + TW * 0.38, x0 + TW * 0.62, x0 + TW - 3];
  let y = y0 + 6, t = `<rect x="${x0}" y="${y0}" width="${TW}" height="${tH}" fill="none" stroke="#000" stroke-width="0.3"/>`;
  t += `<text x="${x0 + 3}" y="${y}" font-size="3.2" font-weight="700">三斜求積表</text>`; y += 5.5;
  t += `<text x="${col[0]}" y="${y}" font-size="2.5">No</text><text x="${col[1]}" y="${y}" font-size="2.5" text-anchor="end">底辺(m)</text><text x="${col[2]}" y="${y}" font-size="2.5" text-anchor="end">高さ(m)</text><text x="${col[3]}" y="${y}" font-size="2.5" text-anchor="end">倍面積(㎡)</text>`;
  t += `<line x1="${x0 + 2}" y1="${y + 1.3}" x2="${x0 + TW - 2}" y2="${y + 1.3}" stroke="#000" stroke-width="0.2"/>`;
  for (const r of rows) { y += rh; t += `<text x="${col[0]}" y="${y}" font-size="${fs}">${r.no}</text><text x="${col[1]}" y="${y}" font-size="${fs}" text-anchor="end">${cmText(r.bCm)}</text><text x="${col[2]}" y="${y}" font-size="${fs}" text-anchor="end">${cmText(r.hCm)}</text><text x="${col[3]}" y="${y}" font-size="${fs}" text-anchor="end">${cm2ToM2Text(r.double)}</text>`; }
  const line2 = (label, val, bold = false, size = 2.7) => { y += size + 2.2; return `<text x="${col[0]}" y="${y}" font-size="${size}" ${bold ? 'font-weight="700"' : ""}>${label}</text><text x="${col[3]}" y="${y}" font-size="${size}" ${bold ? 'font-weight="700"' : ""} text-anchor="end">${val}</text>`; };
  y += 1.5; t += `<line x1="${x0 + 2}" y1="${y}" x2="${x0 + TW - 2}" y2="${y}" stroke="#000" stroke-width="0.2"/>`;
  t += line2("倍面積の合計", `${cm2ToM2Text(C.sansha.T)}㎡`);
  t += line2("面積（倍面積÷2）", `${(C.sansha.T / 20000).toFixed(5).replace(/0$/, "")}㎡`);
  const ch = C.chiseki.text ? `${C.chiseki.text}㎡` : "—（地目未選択）";
  t += line2(`概算面積（${esc(work.chimoku || "地目未選択")}）`, ch, true, 3);
  y += 3; t += `<line x1="${x0 + 2}" y1="${y}" x2="${x0 + TW - 2}" y2="${y}" stroke="#000" stroke-width="0.2"/>`;
  const kobo = work.refs.area.valueM2;
  t += line2("公簿面積", kobo ? `${kobo}㎡` : "—", true, 4);
  if (C.scale.method === "area") { y += 5; t += `<text x="${col[0]}" y="${y}" font-size="2.5">面積基準で縮尺を算出（差の欄なし）</text>`; }
  else if (C.compare) t += line2("差（概算−公簿）", `${C.compare.diff >= 0 ? "+" : ""}${formatArea(C.compare.diff)}㎡（${pct(C.compare.pct)}）`);

  // 見出し
  const head = `<text x="${M + 3}" y="${M + 8}" font-size="5.5" font-weight="700">現況図（概算）</text>
   <text x="${M + 60}" y="${M + 7.6}" font-size="3.2">所在 ${esc(d.shozai) || "—"}　　地番 ${esc(d.chiban) || "—"}　　地目 ${esc(work.chimoku) || "—"}</text>
   <line x1="${M}" y1="${M + HEAD}" x2="${W - M}" y2="${M + HEAD}" stroke="#000" stroke-width="0.3"/>`;
  // 下の欄（縮尺・基準・注意書き・作成日など）
  const fy = H - M - FOOT, refs = referenceList(work, C);
  const sx = C.scale.sx, sy = C.scale.sy;
  const est = C.paperDen ? (work.anisotropic && C.scale.aniso?.ok ? `約1/${Math.round(C.paperDen)}（横 ${(sx * 1000).toFixed(3)}・縦 ${(sy * 1000).toFixed(3)} mm/px）` : `約1/${Math.round(C.paperDen)}`) : (work.anisotropic && C.scale.aniso?.ok ? `用紙不明（横 ${(sx * 1000).toFixed(3)}・縦 ${(sy * 1000).toFixed(3)} mm/px）` : "用紙不明のため表示なし");
  const method = C.scale.method === "area" ? "面積基準で縮尺を算出" : `辺の長さ（${C.scale.usedLengths}本）を基準に縮尺を算出`;
  const refText = wrap(`使った基準：${refs.join("、") || "—"}`, d.paper === "A3" ? 120 : 84);
  const foot = `<rect x="${M}" y="${fy}" width="${W - 2 * M}" height="${FOOT}" fill="none" stroke="#000" stroke-width="0.3"/>
   <text x="${M + 3}" y="${fy + 5}" font-size="2.8">図面縮尺 ${sc.fixed ? `1/${sc.denominator}` : "縮尺任意"}　　公図の推定縮尺 ${esc(est)}　　${method}　　台形補正 ${work.rectify.enabled ? "あり" : "なし"}</text>
   ${refText.slice(0, 2).map((l, i) => `<text x="${M + 3}" y="${fy + 9.6 + i * 3.8}" font-size="2.6">${esc(l)}${i === 1 && refText.length > 2 ? "…" : ""}</text>`).join("")}
   <text x="${M + 3}" y="${fy + 19}" font-size="3.4" font-weight="700">※${NOTICE}</text>
   <text x="${M + 3}" y="${fy + 24.2}" font-size="2.8">作成日 ${formatYmd(d.createdDate) || "—"}　　作成者 ${esc(d.author) || "—"}　　${esc(d.officeName)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" style="font-family: var(--font, sans-serif)">
   <defs><clipPath id="drawClip"><rect x="${M}" y="${M + HEAD}" width="${W - 2 * M - TW}" height="${H - 2 * M - HEAD - FOOT}"/></clipPath></defs>
   <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/><rect x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" fill="none" stroke="#000" stroke-width="0.5"/>${head}${g}${t}${foot}</svg>`;
  return { svg, W, H, scale: sc, refs };
}

/** 全角を2、半角を1として、だいたいの幅で折り返す */
export function wrap(s, width) {
  const out = []; let cur = "", w = 0;
  for (const ch of s) { const cw = /[\x20-\x7e]/.test(ch) ? 1 : 2; if (w + cw > width) { out.push(cur); cur = ""; w = 0; } cur += ch; w += cw; }
  if (cur) out.push(cur);
  return out;
}

/** 方位記号（deg: 上から時計回りの角度） */
export function northSvg(x, y, deg, s) {
  return `<g transform="translate(${x} ${y}) rotate(${deg})"><circle r="${s * 0.55}" fill="none" stroke="#000" stroke-width="${s * 0.04}"/><path d="M0 ${-s * 0.5} L${s * 0.2} ${s * 0.3} L0 ${s * 0.15} L${-s * 0.2} ${s * 0.3} Z" fill="#000"/><text y="${-s * 0.75}" font-size="${s * 0.33}" text-anchor="middle" transform="rotate(${-deg} 0 ${-s * 0.75})" dominant-baseline="middle">N</text></g>`;
}
