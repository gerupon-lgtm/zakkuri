// ざっくり地積 試作α（ZC-0.1.x）。画面の状態管理・描画・操作
import { APP_VERSION } from "../version.js";
import { compute, resolveRef } from "../core/compute.js";
import { flip, diagonals } from "../core/triangulate.js";
import { CHIMOKU } from "../core/chimoku.js";
import { cmText, cm2ToM2Text } from "../core/sansha.js";
import { quadValid } from "../core/homography.js";
import { roundHalfUp, formatLength, formatArea } from "../shared/round.js";
import { todayJst, formatTyping, parseDateInput, formatYmd } from "../shared/date.js";
import { createStore } from "../io/store.js";
import { APP_ID, SCHEMA_VERSION, parseWorkFile } from "../io/workfile.js";
import { decode, isPdf, openPdf, renderPdfPage, displayImage, rectifiedPreview, blobToBase64, base64ToBlob } from "../io/image.js";
import { MSG, msgOf } from "./messages.js";
import { buildSheet } from "./sheet.js";
import { toSima, toDxf } from "../core/cadexport.js";
import { encodeSjis } from "../io/sjis.js";
import { alignAngle, normDeg } from "../shared/rotate.js";

const BRAND_LOGO = `<svg class="logo" viewBox="0 0 100 100" aria-hidden="true">
  <path d="M25 70 43 24 75 70Z" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/>
  <path d="M43 39v3m0 7v3m0 7v3" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>
</svg>`;
const store = createStore();
const $app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
const num = (v) => (v === "" || v == null ? NaN : Number(String(v).replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/,/g, "")));
const TABS = [["load", "①読込"], ["rect", "②補正"], ["vert", "③頂点"], ["ref", "④基準"], ["tri", "⑤分割"], ["info", "⑥図面"]];
const ICON = {
  cal: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  fit: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`,
};

function newWork() {
  return {
    appId: APP_ID, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, savedAt: null,
    image: null, rectify: { enabled: false, corners: null, paper: "unknown", orientation: "landscape" },
    vertices: [], closed: false, north: null,
    refs: { lengths: [], area: { valueM2: null, chisekiChosa: false } },
    chimoku: "", anisotropic: false, triangles: null,
    drawing: { shozai: "", chiban: "", officeName: "", author: "", createdDate: todayJst(), paper: "A4", rotationDeg: 0, showBackground: false },
    lastTab: "load",
  };
}

// ---------- 状態 ----------
const S = {
  w: newWork(), disp: null, C: {}, tab: "load", vt: { cx: 0, cy: 0, k: 1 }, sel: null, tool: null, pick: [], insertAfter: null,
  view: "work", bg: null, msg: null, loupe: null, pdf: null, panelMin: false, prefs: {}, busy: null, undo: [], redo: [],
};
let saveTimer = null;

const snap = () => JSON.stringify({ ...S.w, image: null });
function pushUndo() { S.undo.push(snap()); if (S.undo.length > 50) S.undo.shift(); S.redo = []; }
function restore(json) { const img = S.w.image; S.w = { ...JSON.parse(json), image: img }; changed(false); }

/** 入力が変わったら：計算し直して、少し待ってから端末に保存（F-011） */
function changed(rerender = true) {
  S.C = compute(S.w);
  if (S.C.trisReset && S.w.triangles) { S.w.triangles = null; S.msg = { cls: "warn", text: "頂点が変わったため、三角形の分け方を自動分割に戻しました" }; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    S.w.savedAt = new Date().toISOString(); S.w.appVersion = APP_VERSION; S.w.lastTab = S.tab;
    if (!(await store.putWork(S.w))) { S.msg = { cls: "err", text: MSG.SAVE_FAILED }; render(); }
  }, 500);
  if (rerender) render();
}
function edit(fn, rerender = true) { pushUndo(); fn(S.w); changed(rerender); }

// ---------- ダイアログ ----------
function modal(text, withInput = false, value = "", type = "text") {
  return new Promise((res) => {
    const d = document.createElement("dialog");
    d.innerHTML = `<p>${esc(text)}</p>${withInput ? `<input type="${type}" ${type === "number" ? 'inputmode="decimal" step="0.001"' : ""} value="${esc(value)}" style="width:100%;padding:6px">` : ""}<div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" value="0">キャンセル</button><button class="btn primary" value="1">OK</button></div>`;
    document.body.appendChild(d);
    const done = (ok) => { const v = d.querySelector("input")?.value; d.close(); d.remove(); res(withInput ? (ok ? v : null) : ok); };
    d.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) done(b.value === "1"); });
    d.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); done(true); } });
    d.showModal(); d.querySelector("input")?.focus();
  });
}
function showImageDialog(title, src) {
  const d = document.createElement("dialog"); d.className = "imgdlg";
  d.innerHTML = `<p><b>${esc(title)}</b></p><img src="${src}" alt="${esc(title)}"><div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn primary">閉じる</button></div>`;
  document.body.appendChild(d); d.addEventListener("click", (e) => { if (e.target.closest("button")) { d.close(); d.remove(); } }); d.showModal();
}

// ---------- 画像の読み込み（F-001） ----------
async function setImage(blob, meta) {
  S.busy = "画像を準備しています…"; render();
  try {
    const bmp = await decode(blob);
    const disp = await displayImage(bmp);
    if (S.disp) URL.revokeObjectURL(S.disp.url);
    S.disp = disp;
    const w = newWork();
    w.drawing.officeName = S.prefs.officeName ?? ""; w.drawing.author = S.prefs.author ?? "";
    w.image = { name: meta.name, mime: blob.type === "image/png" ? "image/png" : "image/jpeg", data: blob, width: bmp.width, height: bmp.height, source: meta.source, pdfPage: meta.pdfPage ?? null };
    // 写真（カメラで撮影）は補正オン、スキャン・PDFは補正オフを初期値にする【想定】
    w.rectify = { enabled: !!meta.photo, corners: defaultCorners(bmp.width, bmp.height), paper: "unknown", orientation: bmp.width >= bmp.height ? "landscape" : "portrait" };
    bmp.close?.();
    S.w = w; S.undo = []; S.redo = []; S.sel = null; S.tool = null; S.pick = []; S.pdf = null;
    S.tab = meta.photo ? "rect" : "vert"; S.msg = { text: meta.photo ? "四隅の点を公図の用紙の角に合わせてください" : "土地の角を順にタップして、頂点を置いてください" };
    S.busy = null; changed(); requestAnimationFrame(fit);
  } catch (e) { S.busy = null; S.msg = { cls: "err", text: msgOf(e.code ?? "IMAGE_INVALID") }; render(); }
}
const defaultCorners = (w, h) => [{ x: w * 0.1, y: h * 0.1 }, { x: w * 0.9, y: h * 0.1 }, { x: w * 0.9, y: h * 0.9 }, { x: w * 0.1, y: h * 0.9 }];

async function confirmReplace() {
  if (!S.w.image) return true;
  return modal("新しい作業を始めると、今の作業は消えます。必要なら、先に⑥で作業ファイルを書き出してください。続けますか？");
}

async function onFile(file, photo) {
  if (!file) return;
  if (isPdf(file)) {
    S.busy = "PDFを開いています…"; render();
    try {
      const { doc, pages } = await openPdf(file);
      if (pages === 1) return loadPdfPage(doc, 1, file.name);
      S.busy = "ページの一覧を作っています…"; render();
      const thumbs = []; for (let i = 1; i <= Math.min(pages, 30); i++) thumbs.push(await renderPdfPage(doc, i, true));
      S.pdf = { doc, name: file.name, thumbs }; S.busy = null; S.tab = "load"; render();
    } catch (e) { S.busy = null; S.msg = { cls: "err", text: msgOf(e.code ?? "PDF_INVALID") }; render(); }
    return;
  }
  if (!/^image\/(jpeg|png)$/.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) { S.msg = { cls: "err", text: MSG.IMAGE_INVALID }; return render(); }
  return setImage(file, { name: file.name, source: "image", photo });
}
async function loadPdfPage(doc, n, name) {
  S.busy = `${n}ページ目を画像にしています…`; render();
  try { const blob = await renderPdfPage(doc, n); await setImage(blob, { name, source: "pdf", pdfPage: n }); }
  catch (e) { S.busy = null; S.msg = { cls: "err", text: msgOf(e.code ?? "PDF_INVALID") }; render(); }
}

// ---------- 作業ファイル（F-012） ----------
async function exportWork() {
  const w = { ...S.w, appVersion: APP_VERSION, savedAt: new Date().toISOString(), image: { ...S.w.image, data: await blobToBase64(S.w.image.data) } };
  const blob = new Blob([JSON.stringify(w)], { type: "application/json" });
  const base = (S.w.drawing.chiban || S.w.image.name.replace(/\.[^.]+$/, "") || "work").replace(/[\\/:*?"<>|]/g, "_");
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${base}.zakkuri.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
/** ファイルとして保存させる（端末の中だけで作る。C-01） */
function download(data, name, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const baseName = () => (S.w.drawing.chiban || S.w.image?.name.replace(/\.[^.]+$/, "") || "zakkuri").replace(/[\\/:*?"<>|]/g, "_");
function exportCad(kind) {
  if (!S.C.sansha) return;
  if (kind === "sima") return download(encodeSjis(toSima(S.w, S.C)), `${baseName()}.sim`, "application/octet-stream");
  const sc = buildSheet(S.w, S.C).scale;
  download(encodeSjis(toDxf(S.w, S.C, sc.fixed ? sc.denominator : 250)), `${baseName()}.dxf`, "application/dxf");
}

async function importWork(file) {
  const r = parseWorkFile(await file.text());
  if (r.code) { S.msg = { cls: "err", text: msgOf(r.code) }; return render(); } // 今の作業はそのまま（C-04）
  if (!(await confirmReplace())) return;
  const w = { ...newWork(), ...r.work };
  w.image = { ...r.work.image, data: base64ToBlob(r.work.image.data, r.work.image.mime) };
  try { const bmp = await decode(w.image.data); const disp = await displayImage(bmp); bmp.close?.(); if (S.disp) URL.revokeObjectURL(S.disp.url); S.disp = disp; }
  catch { S.msg = { cls: "err", text: MSG.FILE_INVALID }; return render(); }
  S.w = w; S.undo = []; S.redo = []; S.sel = null; S.tool = null; S.tab = w.lastTab || "vert";
  S.msg = { text: `「${file.name}」を読み込みました` }; changed(); requestAnimationFrame(fit);
}

// ---------- 描画 ----------
function render() {
  if (S.view === "preview") return renderPreview();
  const head = `<header class="noprint">${BRAND_LOGO}<h1>ざっくり地積</h1><span class="sp"></span>${S.w.image ? `<button class="btn sm" data-act="undo" ${S.undo.length ? "" : "disabled"}>元に戻す</button><button class="btn sm" data-act="redo" ${S.redo.length ? "" : "disabled"}>やり直す</button>` : ""}</header>`;
  const foot = `<footer class="noprint">${APP_VERSION} ・ © 2026 SIKUMI LAB</footer>`;
  const canvas = S.w.image ? `<div class="canvas" id="cv"><svg id="svg"></svg><div class="float"><button class="btn sm" data-act="fit" aria-label="全体を表示">${ICON.fit}</button>${toolBadge()}</div>${areaBadge()}</div>` : `<div class="canvas empty"><div class="hello"><p><b>公図を読み込んでください</b></p><p class="note">スキャン画像・写真（JPEG・PNG）・PDFが使えます。<br>画像はこの端末の中だけで処理し、外部へは送りません。</p></div></div>`;
  const tabs = `<div class="tabs">${TABS.map(([k, l]) => `<button class="${S.tab === k ? "on" : ""} ${tabDone(k) ? "done" : ""}" data-tab="${k}" ${!S.w.image && k !== "load" ? "disabled" : ""}>${l}</button>`).join("")}</div>`;
  const msg = S.busy ? `<div class="msg">${esc(S.busy)}</div>` : S.msg ? `<div class="msg ${S.msg.cls ?? ""}">${S.msg.html ?? esc(S.msg.text)}</div>` : "";
  const body = { load: loadHtml, rect: rectHtml, vert: vertHtml, ref: refHtml, tri: triHtml, info: infoHtml }[S.tab]();
  $app.innerHTML = head + `<main><div class="editor">${canvas}<div class="panel ${S.panelMin ? "min" : ""}"><div class="grab" data-act="grab"></div>${tabs}<div class="pbody">${msg}${body}</div></div></div></main>` + foot;
  if (S.w.image) { drawSvg(); bindCanvas(); }
  if (S.tab === "info") bindDateInput();
}
const tabDone = (k) => ({ load: !!S.w.image, rect: !!S.w.image && !S.C.rectifyError, vert: S.w.closed && !S.C.polyCode, ref: !!S.C.scale && !S.C.scale.code, tri: !!S.C.sansha, info: !!(S.w.drawing.shozai || S.w.drawing.chiban) }[k]);
function toolBadge() {
  if (S.tool === "north") return `<span class="tool">北：${S.pick.length ? "北の方向をタップ" : "始点をタップ"} <button class="btn sm" data-act="toolCancel">やめる</button></span>`;
  if (S.tool === "ref2") return `<span class="tool">基準：${S.pick.length ? "2点目をタップ" : "1点目をタップ"} <button class="btn sm" data-act="toolCancel">やめる</button></span>`;
  if (S.insertAfter) return `<span class="tool">頂点${idxOf(S.insertAfter) + 1}の後ろに追加：位置をタップ <button class="btn sm" data-act="insCancel">やめる</button></span>`;
  return "";
}
function areaBadge() {
  if (!S.C.sansha) return "";
  const ch = S.C.chiseki;
  return `<div class="measure">概算 ${ch.text ? `${ch.text}㎡` : `${formatArea(S.C.approxM2)}㎡`}</div>`;
}
const idxOf = (id) => S.w.vertices.findIndex((v) => v.id === id);

// --- ① 読込
function loadHtml() {
  if (S.pdf) return `<h4>ページを選んでください（${esc(S.pdf.name)}）</h4><div class="thumbs">${S.pdf.thumbs.map((t, i) => `<button class="thumb" data-act="pdfPage" data-n="${i + 1}"><img src="${t}" alt="${i + 1}ページ"><span>${i + 1}</span></button>`).join("")}</div><button class="btn" data-act="pdfCancel">やめる</button>`;
  const im = S.w.image;
  return `${im ? `<div class="card"><div class="t"><div class="n">${esc(im.name)}</div><div class="d">${im.width}×${im.height}px ・ ${im.source === "pdf" ? `PDF ${im.pdfPage}ページ目` : "画像"}</div></div></div><h4>別の公図を読み込む</h4>` : ""}
  <div class="row"><label class="btn primary file">ファイルを選ぶ<input type="file" accept="image/jpeg,image/png,application/pdf,.pdf,.jpg,.jpeg,.png" data-act="file" hidden></label>
  <label class="btn file">カメラで撮る<input type="file" accept="image/*" capture="environment" data-act="camera" hidden></label></div>
  <p class="note">JPEG・PNG・PDF。PDFは1ページずつ画像にして使います。</p>
  <h4>作業ファイル</h4><div class="row"><label class="btn file">作業ファイルを読み込む<input type="file" accept=".json,application/json" data-act="workfile" hidden></label>${im ? `<button class="btn" data-act="export">書き出す</button>` : ""}</div>
  <h4>アプリを共有</h4><div class="row"><button class="btn" data-act="share">このアプリのURLを共有</button></div><p class="note">アプリのURLだけを送ります。公図や作業の内容は送りません。</p><div id="shareOut"></div>
  ${im ? `<h4>作業を消す</h4><button class="btn danger" data-act="clearWork">この作業を消して最初から</button>` : ""}`;
}
// --- ② 補正
function rectHtml() {
  const r = S.w.rectify;
  const err = S.C.rectifyError ? `<div class="msg err">${MSG.QUAD_DEGENERATE}<div class="row" style="margin-top:6px"><button class="btn sm" data-act="cornersReset">四隅を初期位置に戻す</button><button class="btn sm" data-act="rectOff">補正なしで進める</button></div></div>` : "";
  return `<div class="row"><label>台形補正</label><span class="seg"><button class="${r.enabled ? "on" : ""}" data-act="rectOn">する</button><button class="${!r.enabled ? "on" : ""}" data-act="rectOff">しない</button></span></div>
  <p class="note">斜めから撮った写真は「する」にして、図の四隅の点を<b>公図の用紙の角</b>（または枠の角）に合わせます。スキャン画像はふつう「しない」で構いません。</p>
  ${err}
  <div class="row"><label>用紙</label><select data-set="paper">${[["unknown", "不明"], ["A4", "A4"], ["A3", "A3"], ["B4", "B4"]].map(([v, l]) => `<option value="${v}" ${r.paper === v ? "selected" : ""}>${l}</option>`).join("")}</select>
  <span class="seg"><button class="${r.orientation === "portrait" ? "on" : ""}" data-act="orient" data-v="portrait">縦</button><button class="${r.orientation === "landscape" ? "on" : ""}" data-act="orient" data-v="landscape">横</button></span></div>
  <p class="note">用紙が分かると、補正後の縦横比が正しくなり、公図の推定縮尺（1/N）も表示できます。</p>
  ${r.enabled ? `<div class="row"><button class="btn" data-act="rectPreview" ${S.C.rectifyError ? "disabled" : ""}>補正後を確認</button><button class="btn" data-act="cornersReset">四隅を戻す</button></div>${nudgeHtml()}` : ""}
  <div class="row"><button class="btn primary" data-tab="vert">次へ（頂点）</button></div>`;
}
function nudgeHtml() {
  if (!S.sel) return `<p class="note">点をタップして選ぶと、矢印で1pxずつ動かせます。長押しで拡大鏡が出ます。</p>`;
  return `<div class="row"><label>微調整</label><span class="nudge"><button class="btn sm" data-act="nudge" data-d="-1,0" aria-label="左へ">←</button><button class="btn sm" data-act="nudge" data-d="0,-1" aria-label="上へ">↑</button><button class="btn sm" data-act="nudge" data-d="0,1" aria-label="下へ">↓</button><button class="btn sm" data-act="nudge" data-d="1,0" aria-label="右へ">→</button></span></div>`;
}
// --- ③ 頂点
function vertHtml() {
  const n = S.w.vertices.length, sel = S.sel?.kind === "v" ? S.sel.id : null;
  const pc = S.C.polyCode;
  return `<p class="note">${S.w.closed ? "外周を閉じました。頂点はドラッグで動かせます。" : "土地の角を順にタップして頂点を置きます。最初の頂点をもう一度タップすると閉じます。"}</p>
  <div class="row"><b>頂点 ${n}個</b>${S.w.closed ? `<span class="badge">閉じています</span>` : ""}
   ${!S.w.closed && n >= 3 ? `<button class="btn sm primary" data-act="close">外周を閉じる</button>` : ""}${S.w.closed ? `<button class="btn sm" data-act="open">閉じを解除</button>` : ""}</div>
  ${S.w.closed && pc && pc !== "POLY_TOO_FEW" ? `<div class="msg err">${msgOf(pc)}</div>` : ""}
  ${sel ? `<div class="selbox"><div class="row"><b>頂点${idxOf(sel) + 1}を選択中</b><button class="btn sm danger" data-act="vDel">削除</button><button class="btn sm" data-act="vIns">この後ろに追加</button><button class="btn sm" data-act="unsel">選択を外す</button></div>${nudgeHtml()}</div>` : nudgeHtml()}
  <h4>北の向き</h4><div class="row"><button class="btn sm ${S.tool === "north" ? "on" : ""}" data-act="north">${S.w.north ? "北を指定し直す" : "北を指定"}</button>${S.w.north ? `<button class="btn sm" data-act="northDel">北を消す</button>` : ""}</div>
  <p class="note">公図の方位記号に沿って、始点→北の順に2点をタップします。</p>
  <div class="row">${n ? `<button class="btn sm danger" data-act="vClear">頂点をすべて消す</button>` : ""}<button class="btn primary" data-tab="ref" ${S.w.closed ? "" : "disabled"}>次へ（基準）</button></div>`;
}
// --- ④ 基準
function refHtml() {
  const w = S.w, C = S.C, n = w.vertices.length;
  const edgeRef = (i) => { const a = w.vertices[i].id, b = w.vertices[(i + 1) % n].id; return w.refs.lengths.find((r) => (r.v1 === a && r.v2 === b) || (r.v1 === b && r.v2 === a)); };
  const flagOf = (id) => C.scale?.refs?.find((x) => x.id === id);
  const edges = w.closed ? w.vertices.map((_, i) => { const r = edgeRef(i), f = r && flagOf(r.id);
    const est = C.edgeLen ? formatLength(C.edgeLen[i]) : "—";
    return `<tr class="${S.hlEdge === i ? "hl" : ""}"><td>${i + 1}–${(i + 1) % n + 1}</td><td><input type="text" inputmode="decimal" data-edge="${i}" value="${r ? r.lengthM : ""}" placeholder="—" aria-label="辺${i + 1}の長さ（m）"></td><td class="n">${r ? "" : est}</td><td>${f ? `<span class="${f.flag ? "badge error" : "note"}">${fmtPct(f.diffPct)}</span>` : ""}</td></tr>`; }).join("") : "";
  const others = w.refs.lengths.filter((r) => !(r.v1 && r.v2 && isEdge(r.v1, r.v2)));
  const ar = w.refs.area;
  return `<p class="note">分かっている辺の長さ（m）か、公簿面積を入れると、縮尺を割り出します。1つでも計算できます。</p>
  ${w.closed ? `<h4>辺の長さ（m）</h4><div class="scroll"><table class="tbl"><tr><th>辺</th><th>入力</th><th>推定</th><th>差</th></tr>${edges}</table></div>` : `<div class="msg warn">③で外周を閉じると、辺ごとに長さを入れられます</div>`}
  <div class="row"><button class="btn sm ${S.tool === "ref2" ? "on" : ""}" data-act="ref2">2点を選んで長さを追加</button></div>
  ${others.length ? `<ul class="ul">${others.map((r, k) => { const f = flagOf(r.id); return `<li>基準${k + 1}：<input type="text" inputmode="decimal" data-reflen="${r.id}" value="${r.lengthM}" style="width:80px"> m ${f ? `<span class="${f.flag ? "badge error" : "note"}">${fmtPct(f.diffPct)}</span>` : ""} <button class="btn sm danger" data-act="refDel" data-id="${r.id}">削除</button></li>`; }).join("")}</ul>` : ""}
  <h4>面積</h4>
  <div class="row"><label>公簿面積</label><input type="text" inputmode="decimal" data-set="areaM2" value="${ar.valueM2 ?? ""}" style="width:110px"> ㎡</div>
  <div class="row"><label><input type="checkbox" data-set="chiseki" ${ar.chisekiChosa ? "checked" : ""}> 地籍調査済み</label><span class="note">（面積を基準に縮尺を出します）</span></div>
  <div class="row"><label>地目</label><select data-set="chimoku"><option value="">選んでください</option>${CHIMOKU.map((c) => `<option ${w.chimoku === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
  <div class="row"><label><input type="checkbox" data-set="aniso" ${w.anisotropic ? "checked" : ""}> 縦横別の縮尺を使う</label></div>
  ${resultHtml()}
  <div class="row"><button class="btn primary" data-tab="tri" ${C.sansha ? "" : "disabled"}>次へ（分割）</button></div>`;
}
const fmtPct = (p) => `${p >= 0 ? "+" : ""}${roundHalfUp(p, 1).toFixed(1)}%`;
const isEdge = (a, b) => { const i = idxOf(a), j = idxOf(b), n = S.w.vertices.length; return S.w.closed && i >= 0 && j >= 0 && ((i + 1) % n === j || (j + 1) % n === i); };
function resultHtml() {
  const C = S.C, sc = C.scale;
  if (!sc) return "";
  if (sc.code) return `<div class="msg ${sc.code === "SCALE_NO_REFERENCE" ? "" : "err"}">${msgOf(sc.code)}</div>`;
  const methodText = sc.method === "area" ? "面積基準で縮尺を算出" : `辺の長さ（${sc.usedLengths}本）を基準に縮尺を算出`;
  const an = S.w.anisotropic ? (sc.aniso.ok ? `縦横別：横 ${(sc.sx * 1000).toFixed(3)} ／ 縦 ${(sc.sy * 1000).toFixed(3)} mm/px（比 ${fmtPct((sc.sx / sc.sy - 1) * 100)}）` : MSG.ANISO_INSUFFICIENT) : "";
  const warn = C.warnings.filter((x) => x === "ANISO_LARGE_RATIO").map((x) => `<div class="msg warn">${MSG[x]}</div>`).join("");
  const areaRow = sc.refs.find((r) => r.kind === "area");
  return `<div class="result"><div><b>${methodText}</b></div>
   <div>公図の推定縮尺：${C.paperDen ? `約 1/${Math.round(C.paperDen)}` : "—（②で用紙を選ぶと表示）"}</div>
   ${an ? `<div>${an}</div>` : ""}
   ${areaRow ? `<div>公簿面積との食い違い（縮尺換算）：<span class="${areaRow.flag ? "badge error" : ""}">${fmtPct(areaRow.diffPct)}</span></div>` : ""}
   ${C.sansha ? `<div class="big">概算面積 ${formatArea(C.approxM2)}㎡${C.chiseki.text ? `（地積 ${C.chiseki.text}㎡）` : ""}</div>${C.compare ? `<div>公簿面積との差：${C.compare.diff >= 0 ? "+" : ""}${formatArea(C.compare.diff)}㎡（${fmtPct(C.compare.pct)}）</div>` : ""}` : `<div class="note">外周を閉じると面積を表示します</div>`}
   ${C.sansha && !C.chiseki.text ? `<div class="note">${MSG.CHIMOKU_REQUIRED}</div>` : ""}
   <div class="note">差が±3%を超える基準には印を付けています。</div></div>${warn}`;
}
// --- ⑤ 分割
function triHtml() {
  const C = S.C;
  if (!C.sansha) return `<div class="msg warn">③で外周を閉じ、④で基準を入れると、三角形に分けて求積します</div>`;
  const rows = C.sansha.rows.map((r) => `<tr><td>${r.no}</td><td class="n">${cmText(r.bCm)}</td><td class="n">${cmText(r.hCm)}</td><td class="n">${cm2ToM2Text(r.double)}</td></tr>`).join("");
  return `<p class="note">対角線（三角形の境目の線）をタップすると、もう一方の対角線に入れ替えます。</p>
  <div class="row"><button class="btn sm" data-act="triReset" ${S.w.triangles ? "" : "disabled"}>自動分割に戻す</button></div>
  <h4>三斜求積表</h4><div class="scroll"><table class="tbl num"><tr><th>No</th><th>底辺(m)</th><th>高さ(m)</th><th>倍面積(㎡)</th></tr>${rows}
  <tr class="sum"><td colspan="3">倍面積の合計</td><td class="n">${cm2ToM2Text(C.sansha.T)}</td></tr>
  <tr class="sum"><td colspan="3">面積（÷2）</td><td class="n">${cm2ToM2Text(Math.floor(C.sansha.T / 2))}${C.sansha.T % 2 ? "5" : ""}</td></tr>
  <tr class="sum"><td colspan="3">地積（${esc(S.w.chimoku || "地目未選択")}）</td><td class="n"><b>${C.chiseki.text ? C.chiseki.text + "㎡" : "—"}</b></td></tr></table></div>
  ${!C.chiseki.text ? `<div class="note">${MSG.CHIMOKU_REQUIRED}</div>` : ""}
  ${S.w.refs.area.valueM2 ? `<div class="row">公簿面積 <b>${esc(S.w.refs.area.valueM2)}㎡</b>${C.compare ? `　差 ${C.compare.diff >= 0 ? "+" : ""}${formatArea(C.compare.diff)}㎡（${fmtPct(C.compare.pct)}）` : "（面積基準のため差は出しません）"}</div>` : ""}
  <div class="row"><button class="btn primary" data-tab="info">次へ（図面）</button></div>`;
}
// --- ⑥ 図面
function infoHtml() {
  const d = S.w.drawing;
  const f = (k, l, w = 200) => `<div class="row"><label>${l}</label><input type="text" data-draw="${k}" value="${esc(d[k])}" style="width:${w}px"></div>`;
  return `${f("shozai", "所在")}${f("chiban", "地番", 120)}${f("officeName", "事務所名")}${f("author", "作成者", 140)}
  <div class="row"><label>作成日</label><span class="dateIn"><input type="text" inputmode="numeric" id="dateText" value="${esc(formatYmd(d.createdDate))}" placeholder="yyyy/MM/dd" style="width:120px"><button class="btn sm" data-act="cal" aria-label="カレンダー">${ICON.cal}</button><input type="date" id="datePick" value="${esc(d.createdDate)}" class="hiddenDate"></span><span class="note" id="dateErr"></span></div>
  <h4>図面</h4>
  <div class="row"><label>用紙</label><span class="seg"><button class="${d.paper !== "A3" ? "on" : ""}" data-act="paper" data-v="A4">A4横</button><button class="${d.paper === "A3" ? "on" : ""}" data-act="paper" data-v="A3">A3横</button></span></div>
  <div class="row"><label><input type="checkbox" data-set="showBg" ${d.showBackground ? "checked" : ""}> 公図の画像を背景に重ねる</label></div>
  ${rotateHtml()}
  ${S.C.sansha ? `<div class="row"><button class="btn primary" data-act="preview">図面をプレビュー</button></div>` : `<div class="msg warn">図面を作るには、③で外周を閉じ、④で基準（辺の長さか面積）を入れてください。<div class="row" style="margin-top:6px"><button class="btn sm" data-tab="ref">④基準へ</button></div></div>`}
  <h4>CADデータ（SIMA・DXF）</h4>
  <div class="row"><button class="btn" data-act="sima" ${S.C.sansha ? "" : "disabled"}>SIMAを書き出す</button><button class="btn" data-act="dxf" ${S.C.sansha ? "" : "disabled"}>DXFを書き出す</button></div>
  <p class="note">任意座標（X＝北・Y＝東、頂点1を X=1000・Y=1000）、単位はm、文字コードは Shift_JIS です。${S.w.north ? "" : "<b>北を指定していないため、画像の上を北として書き出します。</b>"}座標は概算で、測量成果ではありません。</p>
  <h4>作業ファイル</h4><div class="row"><button class="btn" data-act="export">作業ファイルを書き出す</button></div>
  <p class="note">別の端末で続けるときや、控えを残すときに使います。①から読み込めます。</p>`;
}
function rotateHtml() {
  const d = S.w.drawing, n = S.w.vertices.length;
  if (!S.C.real || !S.w.closed) return "";
  return `<div class="row"><label>図の回転</label><input type="text" inputmode="decimal" data-set="rot" value="${roundHalfUp(d.rotationDeg || 0, 2)}" style="width:70px"> 度<button class="btn sm" data-act="rot0">0°に戻す</button></div>
  <div class="row"><label>辺でそろえる</label><select id="rotEdge">${S.w.vertices.map((_, i) => `<option value="${i}" ${S.rotEdge === i ? "selected" : ""}>辺${i + 1}–${(i + 1) % n + 1}</option>`).join("")}</select><button class="btn sm" data-act="align" data-m="h">水平に</button><button class="btn sm" data-act="align" data-m="v">垂直に</button></div>
  <p class="note">回すのは図面の見た目だけです（頂点・面積は変わりません）。北の記号も一緒に回ります。</p>`;
}

// ---------- 図面のプレビュー・印刷（S-002・F-010） ----------
function renderPreview() {
  const d = S.w.drawing;
  if (!S.C.sansha) { S.view = "work"; return render(); }
  const r = buildSheet(S.w, S.C, d.showBackground ? S.bg : null);
  const head = `<header class="noprint">${BRAND_LOGO}<h1>ざっくり地積</h1><span class="sp"></span><button class="btn sm" data-act="closePreview">作業に戻る</button></header>`;
  const foot = `<footer class="noprint">${APP_VERSION} ・ © 2026 SIKUMI LAB</footer>`;
  const ctrl = `<div class="pctrl noprint">
    <div class="row"><label>用紙</label><span class="seg"><button class="${d.paper !== "A3" ? "on" : ""}" data-act="paper" data-v="A4">A4横</button><button class="${d.paper === "A3" ? "on" : ""}" data-act="paper" data-v="A3">A3横</button></span>
    <label style="min-width:0"><input type="checkbox" data-set="showBg" ${d.showBackground ? "checked" : ""}> 公図を背景に</label></div>
    ${rotateHtml()}
    <div class="row"><button class="btn primary" data-act="print">印刷／PDFに保存</button><span class="note">図面縮尺 ${r.scale.fixed ? "1/" + r.scale.denominator : "縮尺任意"}</span></div>
    <p class="note">PDFにするときは、印刷画面の送信先で「PDFに保存」を選び、用紙を${d.paper === "A3" ? "A3" : "A4"}・横、余白を「なし」にしてください。</p></div>`;
  $app.innerHTML = head + `<main class="pmain"><div class="preview">${ctrl}<div class="sheetWrap"><div class="sheet" style="aspect-ratio:${r.W}/${r.H}">${r.svg}</div></div></div></main>` + foot;
}
/** 背景に重ねる画像（補正したときは補正後の画像を作る）。設定が変わったら作り直す */
async function prepareBg() {
  const w = S.w; if (!w.drawing.showBackground || !S.disp || !S.C.scale?.sx) return;
  const key = JSON.stringify(w.rectify);
  if (S.bg?.key === key) { S.bg = { ...S.bg, ax: S.bg.u * S.C.scale.sx, ay: S.bg.u * S.C.scale.sy }; return; }
  if (!w.rectify.enabled) { S.bg = { key, href: S.disp.url, w: S.disp.canvas.width, h: S.disp.canvas.height, u: 1 / S.disp.k }; }
  else { const R = S.C.R; const p = rectifiedPreview(S.disp.canvas, S.disp.k, R.Hi, R.width, R.height, 2000); S.bg = { key, href: p.url, w: p.w, h: p.h, u: 1 / p.f }; }
  S.bg.ax = S.bg.u * S.C.scale.sx; S.bg.ay = S.bg.u * S.C.scale.sy;
}
function setPageSize() {
  let st = document.getElementById("pageSize"); if (!st) { st = document.createElement("style"); st.id = "pageSize"; document.head.appendChild(st); }
  st.textContent = `@page { size: ${S.w.drawing.paper === "A3" ? "A3" : "A4"} landscape; margin: 0 }`;
}
async function share() {
  const url = location.origin + location.pathname; // クエリ文字列・ハッシュを付けない（C-02）
  try { if (navigator.share) { await navigator.share({ title: "ざっくり地積", url }); return; } } catch (e) { if (e?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(url); S.msg = { text: "アプリのURLをコピーしました" }; return render(); } catch { /* 次へ */ }
  render(); const o = document.getElementById("shareOut"); if (o) { o.innerHTML = `<input type="text" readonly value="${esc(url)}" style="width:100%;padding:6px">`; o.querySelector("input").select(); }
}

function bindDateInput() {
  const t = document.getElementById("dateText"), p = document.getElementById("datePick"); if (!t) return;
  let first = true;
  t.addEventListener("focus", () => { if (first) { first = false; setTimeout(() => t.select(), 50); } });
  t.addEventListener("input", () => { const v = formatTyping(t.value); if (v !== t.value) t.value = v; });
  t.addEventListener("change", () => {
    const err = document.getElementById("dateErr");
    if (!t.value.trim()) { edit((w) => { w.drawing.createdDate = ""; }, false); err.textContent = ""; return; }
    const r = parseDateInput(t.value);
    if (r.code) { err.textContent = MSG.DATE_INVALID; err.style.color = "var(--err)"; return; }
    err.textContent = ""; t.value = formatYmd(r.ymd); p.value = r.ymd; edit((w) => { w.drawing.createdDate = r.ymd; }, false);
  });
  p.addEventListener("change", () => { if (p.value) { t.value = formatYmd(p.value); edit((w) => { w.drawing.createdDate = p.value; }, false); } });
}

// ---------- 作業領域のSVG（座標は元画像のpx。y は下向き） ----------
const svgRect = () => document.getElementById("svg")?.getBoundingClientRect() ?? { width: 300, height: 300, left: 0, top: 0 };
const toScr = (p) => { const r = svgRect(); return { x: (p.x - S.vt.cx) * S.vt.k + r.width / 2, y: (p.y - S.vt.cy) * S.vt.k + r.height / 2 }; };
const toImg = (x, y) => { const r = svgRect(); return { x: (x - r.width / 2) / S.vt.k + S.vt.cx, y: (y - r.height / 2) / S.vt.k + S.vt.cy }; };
function fit() {
  const im = S.w.image; if (!im) return; const r = svgRect();
  S.vt = { cx: im.width / 2, cy: im.height / 2, k: Math.min(r.width / im.width, r.height / im.height) * 0.95 }; drawSvg();
}
const line = (a, b, attrs) => { const p = toScr(a), q = toScr(b); return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" ${attrs}/>`; };
const label = (p, t, attrs = "") => `<text x="${p.x}" y="${p.y}" font-size="13" text-anchor="middle" dominant-baseline="middle" stroke="#fff" stroke-width="3.5" paint-order="stroke" ${attrs}>${esc(t)}</text>`;

function drawSvg() {
  const svg = document.getElementById("svg"); if (!svg || !S.w.image) return;
  const w = S.w, C = S.C, im = w.image;
  const o = toScr({ x: 0, y: 0 });
  let g = `<image href="${S.disp?.url ?? ""}" x="${o.x}" y="${o.y}" width="${im.width * S.vt.k}" height="${im.height * S.vt.k}" preserveAspectRatio="none" opacity="${S.tab === "rect" ? 1 : 0.85}"/>`;
  // 補正の四隅
  if (S.tab === "rect" && w.rectify.enabled && w.rectify.corners) {
    const cs = w.rectify.corners.map(toScr);
    g += `<polygon points="${cs.map((p) => `${p.x},${p.y}`).join(" ")}" fill="rgba(47,111,222,.08)" stroke="${S.C.rectifyError ? "#c62828" : "#2f6fde"}" stroke-width="2" stroke-dasharray="6 4"/>`;
    cs.forEach((p, i) => { const sel = S.sel?.kind === "c" && S.sel.i === i; g += `<circle cx="${p.x}" cy="${p.y}" r="${sel ? 12 : 10}" fill="${sel ? "#2f6fde" : "#fff"}" stroke="#2f6fde" stroke-width="3"/>` + label({ x: p.x, y: p.y - 22 }, ["左上", "右上", "右下", "左下"][i], `fill="#2f6fde"`); });
  }
  if (S.tab !== "rect") {
    const V = w.vertices, n = V.length;
    // 三角形の分割（三斜の線と高さ）
    if (C.tris && C.sansha && (S.tab === "tri" || S.tab === "ref")) {
      for (const d of diagonals(C.tris, n)) g += line(V[d.a], V[d.b], `stroke="#2f6fde" stroke-width="${S.tab === "tri" ? 2.5 : 1.5}" stroke-dasharray="7 5"`);
      if (S.tab === "tri") for (const r of C.sansha.rows) {
        const foot = C.R.unmap({ x: r.foot.x / C.scale.sx, y: r.foot.y / C.scale.sy });
        g += line(V[r.apex], foot, `stroke="#e07a1f" stroke-width="1.5" stroke-dasharray="3 3"`);
        const cen = toScr({ x: (V[r.tri[0]].x + V[r.tri[1]].x + V[r.tri[2]].x) / 3, y: (V[r.tri[0]].y + V[r.tri[1]].y + V[r.tri[2]].y) / 3 });
        g += `<circle cx="${cen.x}" cy="${cen.y}" r="11" fill="#fff" stroke="#2f6fde" stroke-width="1.5"/>` + label(cen, r.no, `fill="#2f6fde" font-weight="700" stroke-width="0"`);
      }
    }
    // 外周
    if (n) {
      const pts = V.map(toScr).map((p) => `${p.x},${p.y}`).join(" ");
      g += w.closed ? `<polygon points="${pts}" fill="rgba(198,40,40,.07)" stroke="#c62828" stroke-width="2.5"/>` : `<polyline points="${pts}" fill="none" stroke="#c62828" stroke-width="2.5"/>`;
      for (const [i, j] of C.crossing ?? []) { g += line(V[i], V[(i + 1) % n], `stroke="#c62828" stroke-width="8" opacity=".35"`) + line(V[j], V[(j + 1) % n], `stroke="#c62828" stroke-width="8" opacity=".35"`); }
      // 辺の長さ（縮尺が出ているとき）
      if (C.edgeLen && w.closed && S.tab !== "vert") V.forEach((p, i) => { const q = V[(i + 1) % n]; const m = toScr({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
        const has = w.refs.lengths.some((r) => (r.v1 === p.id && r.v2 === q.id) || (r.v1 === q.id && r.v2 === p.id));
        g += label({ x: m.x, y: m.y }, formatLength(C.edgeLen[i]), `fill="${has ? "#1d2430" : "#666"}" font-weight="${has ? 700 : 400}"`); });
      V.forEach((p, i) => { const q = toScr(p); const sel = S.sel?.kind === "v" && S.sel.id === p.id; const first = i === 0 && !w.closed && n >= 3;
        g += `<circle cx="${q.x}" cy="${q.y}" r="${sel ? 9 : first ? 9 : 6}" fill="${sel ? "#2f6fde" : first ? "#fff" : "#c62828"}" stroke="${first ? "#c62828" : "#fff"}" stroke-width="2"/>` + label({ x: q.x + 12, y: q.y - 12 }, i + 1, `fill="#c62828" font-weight="700"`); });
    }
    // 2点の基準（辺以外）
    for (const r of w.refs.lengths) { if (r.v1 && r.v2 && isEdge(r.v1, r.v2)) continue; const p = resolveRef(w, r); if (!p) continue;
      g += line(p.p1, p.p2, `stroke="#7b3fd0" stroke-width="2.5"`); const m = toScr({ x: (p.p1.x + p.p2.x) / 2, y: (p.p1.y + p.p2.y) / 2 }); g += label(m, `${r.lengthM}m`, `fill="#7b3fd0" font-weight="700"`);
      for (const q of [p.p1, p.p2]) { const s = toScr(q); g += `<rect x="${s.x - 4}" y="${s.y - 4}" width="8" height="8" fill="#7b3fd0"/>`; } }
    if (S.tool && S.pick.length) { const s = toScr(S.pick[0]); g += `<circle cx="${s.x}" cy="${s.y}" r="8" fill="none" stroke="#7b3fd0" stroke-width="3"/>`; }
    // 北
    if (w.north) { const a = toScr({ x: w.north.x1, y: w.north.y1 }), b = toScr({ x: w.north.x2, y: w.north.y2 });
      g += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#1d2430" stroke-width="2.5" marker-end="url(#arr)"/>` + label({ x: b.x, y: b.y - 14 }, "N", `font-weight="700" font-size="15"`); }
  }
  let lo = "";
  if (S.loupe) {
    const { x, y } = S.loupe, R = 58, Z = 3, cy = y > 150 ? y - 100 : y + 100;
    lo = `<defs><clipPath id="loupeClip"><circle cx="${x}" cy="${cy}" r="${R}"/></clipPath></defs><circle cx="${x}" cy="${cy}" r="${R}" fill="#fff"/>
     <g clip-path="url(#loupeClip)"><use href="#scene" transform="translate(${x} ${cy}) scale(${Z}) translate(${-x} ${-y})"/></g>
     <circle cx="${x}" cy="${cy}" r="${R}" fill="none" stroke="#2f6fde" stroke-width="2"/><path d="M${x - 12} ${cy}H${x + 12}M${x} ${cy - 12}V${cy + 12}" stroke="#c62828" stroke-width="1.5"/>`;
  }
  svg.innerHTML = `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#1d2430"/></marker></defs><g id="scene">${g}</g>${lo}`;
}

// ---------- 操作（移動・拡大・タップ・ドラッグ） ----------
const HIT = 24;
function hitTarget(x, y) {
  if (S.tab === "rect" && S.w.rectify.enabled && S.w.rectify.corners) {
    let best = null; S.w.rectify.corners.forEach((c, i) => { const q = toScr(c), d = Math.hypot(q.x - x, q.y - y); if (d < HIT && (!best || d < best.d)) best = { kind: "c", i, d }; }); return best;
  }
  if (S.tab === "vert" && !S.tool) { let best = null; S.w.vertices.forEach((v) => { const q = toScr(v), d = Math.hypot(q.x - x, q.y - y); if (d < HIT && (!best || d < best.d)) best = { kind: "v", id: v.id, d }; }); return best; }
  return null;
}
const targetPos = (t) => (t.kind === "c" ? S.w.rectify.corners[t.i] : S.w.vertices.find((v) => v.id === t.id));
function bindCanvas() {
  const el = document.getElementById("cv"); const ptrs = new Map(); let moved = false, pinch = null, start = null, drag = null, holdTimer = null, dragUndo = false;
  const rel = (e) => { const r = svgRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".float,.measure")) return;
    el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false; dragUndo = false;
    start = { x: e.clientX, y: e.clientY, cx: S.vt.cx, cy: S.vt.cy };
    const p = rel(e); drag = ptrs.size === 1 ? hitTarget(p.x, p.y) : null;
    if (drag) { const tp = targetPos(drag); drag.off = { x: tp.x - toImg(p.x, p.y).x, y: tp.y - toImg(p.x, p.y).y }; }
    clearTimeout(holdTimer);
    if (ptrs.size === 1 && !drag) holdTimer = setTimeout(() => { if (!moved && ptrs.size === 1) { S.loupe = p; drawSvg(); } }, 350);
    if (ptrs.size === 2) { clearTimeout(holdTimer); S.loupe = null; drag = null; const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: S.vt.k, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cx: S.vt.cx, cy: S.vt.cy }; }
  });
  el.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()]; const r = svgRect();
      const k = Math.max(0.01, Math.min(40, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const wpt = { x: (pinch.mid.x - r.left - r.width / 2) / pinch.k + pinch.cx, y: (pinch.mid.y - r.top - r.height / 2) / pinch.k + pinch.cy };
      S.vt = { k, cx: wpt.x - (mid.x - r.left - r.width / 2) / k, cy: wpt.y - (mid.y - r.top - r.height / 2) / k }; moved = true; drawSvg(); return;
    }
    if (S.loupe && ptrs.size === 1 && !drag) { S.loupe = rel(e); drawSvg(); return; }
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) { moved = true; clearTimeout(holdTimer); }
    if (!moved || ptrs.size !== 1) return;
    if (drag) {
      if (!dragUndo) { pushUndo(); dragUndo = true; }
      const p = rel(e), q = toImg(p.x, p.y), np = { x: q.x + drag.off.x, y: q.y + drag.off.y };
      const tp = targetPos(drag); tp.x = np.x; tp.y = np.y; S.sel = drag.kind === "c" ? { kind: "c", i: drag.i } : { kind: "v", id: drag.id };
      S.loupe = toScr(np); S.C = compute(S.w); drawSvg(); return;
    }
    S.vt.cx = start.cx - (e.clientX - start.x) / S.vt.k; S.vt.cy = start.cy - (e.clientY - start.y) / S.vt.k; drawSvg();
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); clearTimeout(holdTimer); if (ptrs.size < 2) pinch = null;
    if (drag && moved) { drag = null; S.loupe = null; changed(); return; }
    if (S.loupe && ptrs.size === 0) { const p = S.loupe; S.loupe = null; drawSvg(); return onTap(p.x, p.y); }
    if (!moved && ptrs.size === 0) { const r = svgRect(); onTap(e.clientX - r.left, e.clientY - r.top); }
    drag = null;
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", (e) => { ptrs.delete(e.pointerId); clearTimeout(holdTimer); S.loupe = null; if (drag && dragUndo) changed(); drag = null; drawSvg(); });
  el.addEventListener("wheel", (e) => {
    e.preventDefault(); const r = svgRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const before = toImg(sx, sy); S.vt.k = Math.max(0.01, Math.min(40, S.vt.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const after = toImg(sx, sy); S.vt.cx += before.x - after.x; S.vt.cy += before.y - after.y; drawSvg();
  }, { passive: false });
}

/** 点を選ぶとき、頂点の近くなら頂点に吸い付ける */
function snapVertex(x, y) { let best = null; for (const v of S.w.vertices) { const q = toScr(v), d = Math.hypot(q.x - x, q.y - y); if (d < HIT && (!best || d < best.d)) best = { v, d }; } return best?.v ?? null; }

async function onTap(x, y) {
  const w = S.w, p = toImg(x, y);
  if (S.tab === "rect") { const t = hitTarget(x, y); S.sel = t ? { kind: "c", i: t.i } : null; return render(); }
  if (S.tool === "north") {
    S.pick.push(p);
    if (S.pick.length === 2) { const [a, b] = S.pick; S.tool = null; S.pick = []; S.panelMin = false; if (Math.hypot(b.x - a.x, b.y - a.y) * S.vt.k < 10) { S.msg = { cls: "err", text: "2点が近すぎます。もう一度指定してください" }; return render(); } S.msg = { text: "北の向きを指定しました" }; return edit((w) => { w.north = { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }); }
    return render();
  }
  if (S.tool === "ref2") {
    const v = snapVertex(x, y); S.pick.push(v ? { x: v.x, y: v.y, vid: v.id } : p);
    if (S.pick.length < 2) return render();
    const [a, b] = S.pick; S.tool = null; S.pick = []; S.panelMin = false;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) { S.msg = { cls: "err", text: MSG.REF_SAME_POINT }; return render(); }
    render();
    const L = num(await modal("この2点の間の実際の長さ（m）", true, "", "number"));
    if (!(L > 0)) { if (!Number.isNaN(L)) S.msg = { cls: "err", text: MSG.REF_NON_POSITIVE }; return render(); }
    S.msg = null;
    return edit((w) => { w.refs.lengths.push({ id: uid(), p1: { x: a.x, y: a.y }, p2: { x: b.x, y: b.y }, v1: a.vid ?? null, v2: b.vid ?? null, lengthM: roundHalfUp(L, 3) }); });
  }
  if (S.tab === "tri") {
    const C = S.C; if (!C.tris) return;
    let best = null; const V = w.vertices;
    for (const d of diagonals(C.tris, V.length)) { const a = toScr(V[d.a]), b = toScr(V[d.b]); const dd = distSeg({ x, y }, a, b); if (dd < 18 && (!best || dd < best.dd)) best = { ...d, dd }; }
    if (!best) { S.msg = { text: MSG.FLIP_NOT_DIAGONAL }; return render(); }
    const r = flip(C.real, C.tris, best.a, best.b);
    if (r.code) { S.msg = { cls: "warn", text: msgOf(r.code) }; return render(); }
    S.msg = null; return edit((w) => { w.triangles = r.tris; });
  }
  if (S.tab === "vert") {
    const t = hitTarget(x, y);
    if (t) {
      if (!w.closed && w.vertices.length >= 3 && w.vertices[0].id === t.id) { S.sel = null; S.msg = { text: "外周を閉じました。④で基準を入れてください" }; return edit((w) => { w.closed = true; }); }
      S.sel = S.sel?.id === t.id ? null : { kind: "v", id: t.id }; return render();
    }
    if (S.insertAfter) { const i = idxOf(S.insertAfter); const nv = { id: uid(), x: p.x, y: p.y }; S.insertAfter = null; S.sel = { kind: "v", id: nv.id }; return edit((w) => { w.vertices.splice(i + 1, 0, nv); }); }
    if (!w.closed) { const nv = { id: uid(), x: p.x, y: p.y }; return edit((w) => { w.vertices.push(nv); }); }
    if (S.sel) { S.sel = null; return render(); }
    S.msg = { text: "外周は閉じています。頂点を足すときは、頂点を選んで「この後ろに追加」を押してください" }; return render();
  }
}
const distSeg = (p, a, b) => { const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy; const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L)) : 0; return Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy); };

function nudge(dx, dy) {
  if (!S.sel) return; const t = S.sel.kind === "c" ? S.w.rectify.corners[S.sel.i] : S.w.vertices.find((v) => v.id === S.sel.id); if (!t) return;
  const step = 1 / S.vt.k; // 画面上の1px
  edit(() => { t.x += dx * step; t.y += dy * step; }, false); drawSvg(); refreshPanelSoft();
}
/** パネルの数値だけを更新（入力中のフォーカスを奪わないため、作業領域の再描画とは分ける） */
function refreshPanelSoft() { const pb = document.querySelector(".pbody"); if (!pb || document.activeElement?.closest?.(".pbody input")) return; const body = { load: loadHtml, rect: rectHtml, vert: vertHtml, ref: refHtml, tri: triHtml, info: infoHtml }[S.tab](); const msg = S.msg ? `<div class="msg ${S.msg.cls ?? ""}">${S.msg.html ?? esc(S.msg.text)}</div>` : ""; pb.innerHTML = msg + body; const m = document.querySelector(".measure"); if (m) m.outerHTML = areaBadge(); }

// ---------- クリック・入力 ----------
$app.addEventListener("click", async (e) => {
  const tb = e.target.closest("[data-tab]");
  if (tb && !tb.disabled) { S.tab = tb.dataset.tab; S.sel = null; S.tool = null; S.pick = []; S.insertAfter = null; S.msg = null; S.panelMin = false; S.w.lastTab = S.tab; store.putWork(S.w); render(); return; }
  const t = e.target.closest("[data-act]"); if (!t || t.tagName === "INPUT") return;
  const act = t.dataset.act, w = S.w;
  switch (act) {
    case "grab": S.panelMin = !S.panelMin; render(); return requestAnimationFrame(() => drawSvg());
    case "fit": return fit();
    case "undo": if (S.undo.length) { S.redo.push(snap()); restore(S.undo.pop()); } return;
    case "redo": if (S.redo.length) { S.undo.push(snap()); restore(S.redo.pop()); } return;
    case "pdfPage": { const pdf = S.pdf; if (!(await confirmReplace())) return; return loadPdfPage(pdf.doc, +t.dataset.n, pdf.name); }
    case "pdfCancel": S.pdf = null; return render();
    case "export": return exportWork();
    case "clearWork": if (!(await modal("この作業を消して、最初からやり直します。よろしいですか？"))) return; await store.delWork(); S.w = newWork(); S.C = {}; S.undo = []; S.redo = []; S.tab = "load"; S.msg = null; return render();
    case "rectOn": return edit((w) => { w.rectify.enabled = true; if (!quadValid(w.rectify.corners)) w.rectify.corners = defaultCorners(w.image.width, w.image.height); });
    case "rectOff": S.sel = null; return edit((w) => { w.rectify.enabled = false; });
    case "orient": return edit((w) => { w.rectify.orientation = t.dataset.v; });
    case "cornersReset": return edit((w) => { w.rectify.corners = defaultCorners(w.image.width, w.image.height); });
    case "rectPreview": { const R = S.C.R; if (!R?.Hi) return; S.busy = "補正後の画像を作っています…"; render(); await new Promise((r) => setTimeout(r, 30)); const { url } = rectifiedPreview(S.disp.canvas, S.disp.k, R.Hi, R.width, R.height); S.busy = null; render(); return showImageDialog("補正後の画像（確認用）", url); }
    case "nudge": { const [dx, dy] = t.dataset.d.split(",").map(Number); return nudge(dx, dy); }
    case "close": S.sel = null; return edit((w) => { w.closed = true; });
    case "open": return edit((w) => { w.closed = false; w.triangles = null; });
    case "unsel": S.sel = null; return render();
    case "vDel": { const id = S.sel.id; S.sel = null; return edit((w) => { w.vertices = w.vertices.filter((v) => v.id !== id); w.refs.lengths = w.refs.lengths.filter((r) => r.v1 !== id && r.v2 !== id); w.triangles = null; if (w.vertices.length < 3) w.closed = false; }); }
    case "vIns": S.insertAfter = S.sel.id; return render();
    case "insCancel": S.insertAfter = null; return render();
    case "vClear": if (!(await modal("頂点をすべて消します。よろしいですか？"))) return; S.sel = null; return edit((w) => { w.vertices = []; w.closed = false; w.triangles = null; w.refs.lengths = w.refs.lengths.filter((r) => !r.v1 && !r.v2); });
    case "north": S.tool = "north"; S.pick = []; S.sel = null; S.msg = null; if (innerWidth < 900) S.panelMin = true; render(); return requestAnimationFrame(() => drawSvg());
    case "northDel": return edit((w) => { w.north = null; });
    case "ref2": S.tool = "ref2"; S.pick = []; S.msg = null; if (innerWidth < 900) S.panelMin = true; render(); return requestAnimationFrame(() => drawSvg());
    case "toolCancel": S.tool = null; S.pick = []; S.panelMin = false; return render();
    case "refDel": return edit((w) => { w.refs.lengths = w.refs.lengths.filter((r) => r.id !== t.dataset.id); });
    case "triReset": S.msg = null; return edit((w) => { w.triangles = null; });
    case "preview": S.busy = null; S.view = "preview"; if (!w.drawing.createdDate) w.drawing.createdDate = todayJst(); await prepareBg(); return render();
    case "closePreview": S.view = "work"; S.tab = "info"; render(); return requestAnimationFrame(fit);
    case "print": setPageSize(); return window.print();
    case "paper": edit((w) => { w.drawing.paper = t.dataset.v; }); return;
    case "rot0": edit((w) => { w.drawing.rotationDeg = 0; }); return;
    case "align": { const i = +document.getElementById("rotEdge").value; S.rotEdge = i; const a = S.C.real[i], b = S.C.real[(i + 1) % S.C.real.length]; edit((w) => { w.drawing.rotationDeg = alignAngle(a, b, t.dataset.m); }); return; }
    case "share": return share();
    case "sima": return exportCad("sima");
    case "dxf": return exportCad("dxf");
    case "brokenDrop": if (!(await modal("保存されていた作業を消します。よろしいですか？"))) return; await store.delWork(); S.broken = null; S.msg = { text: "保存されていた作業を消しました。公図を読み込んでください" }; return render();
    case "brokenExport": { const b = S.broken; if (!b) return; try { const data = b.image?.data instanceof Blob ? await blobToBase64(b.image.data) : null; download(JSON.stringify({ ...b, image: b.image ? { ...b.image, data } : null }), "保存されていた作業.zakkuri.json", "application/json"); } catch { S.msg = { cls: "err", text: "書き出せませんでした" }; render(); } return; }
    case "cal": { const p = document.getElementById("datePick"); try { p.showPicker(); } catch { p.click(); } return; }
  }
});
$app.addEventListener("change", async (e) => {
  const t = e.target, w = S.w;
  if (t.dataset.act === "file" || t.dataset.act === "camera") { const f = t.files[0]; t.value = ""; if (!f || !(await confirmReplace())) return; return onFile(f, t.dataset.act === "camera"); }
  if (t.dataset.act === "workfile") { const f = t.files[0]; t.value = ""; if (f) return importWork(f); return; }
  if (t.dataset.edge != null) {
    const i = +t.dataset.edge, n = w.vertices.length, a = w.vertices[i].id, b = w.vertices[(i + 1) % n].id;
    const v = t.value.trim() === "" ? null : num(t.value);
    if (v != null && !(v > 0)) { S.msg = { cls: "err", text: MSG.REF_NON_POSITIVE }; return render(); }
    S.msg = null;
    return edit((w) => {
      w.refs.lengths = w.refs.lengths.filter((r) => !((r.v1 === a && r.v2 === b) || (r.v1 === b && r.v2 === a)));
      if (v != null) w.refs.lengths.push({ id: uid(), p1: { x: w.vertices[i].x, y: w.vertices[i].y }, p2: { x: w.vertices[(i + 1) % n].x, y: w.vertices[(i + 1) % n].y }, v1: a, v2: b, lengthM: roundHalfUp(v, 3) });
    });
  }
  if (t.dataset.reflen) { const v = num(t.value); if (!(v > 0)) { S.msg = { cls: "err", text: MSG.REF_NON_POSITIVE }; return render(); } S.msg = null; return edit((w) => { w.refs.lengths.find((r) => r.id === t.dataset.reflen).lengthM = roundHalfUp(v, 3); }); }
  if (t.dataset.draw) { const k = t.dataset.draw; edit((w) => { w.drawing[k] = t.value; }, false); if (k === "officeName" || k === "author") { S.prefs[k] = t.value; store.putPrefs(S.prefs); } return; }
  const k = t.dataset.set; if (!k) return;
  if (k === "paper") return edit((w) => { w.rectify.paper = t.value; });
  if (k === "areaM2") { const v = t.value.trim() === "" ? null : num(t.value); if (v != null && !(v > 0)) { S.msg = { cls: "err", text: MSG.REF_NON_POSITIVE }; return render(); } S.msg = null; return edit((w) => { w.refs.area.valueM2 = v; }); }
  if (k === "chiseki") return edit((w) => { w.refs.area.chisekiChosa = t.checked; });
  if (k === "chimoku") return edit((w) => { w.chimoku = t.value; });
  if (k === "aniso") return edit((w) => { w.anisotropic = t.checked; });
  if (k === "showBg") { edit((w) => { w.drawing.showBackground = t.checked; }, false); await prepareBg(); return render(); }
  if (k === "rot") { const v = num(t.value); if (!Number.isFinite(v)) return render(); return edit((w) => { w.drawing.rotationDeg = normDeg(v); }); }
});
window.addEventListener("resize", () => S.w.image && drawSvg());
window.addEventListener("keydown", (e) => {
  if (!S.sel || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!k) return;
  e.preventDefault(); nudge(k[0] * (e.shiftKey ? 10 : 1), k[1] * (e.shiftKey ? 10 : 1));
});

// PWA（公開サイトでだけ登録する）
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").then((reg) => {
    reg.addEventListener("updatefound", () => { const nw = reg.installing; nw?.addEventListener("statechange", () => {
      if (nw.state === "installed" && navigator.serviceWorker.controller) { S.msg = { html: `新しい版があります。<button class="btn sm" data-act="reload">更新する</button>` }; render(); } }); });
  }).catch(() => {});
  $app.addEventListener("click", (e) => { if (e.target.closest("[data-act=reload]")) location.reload(); });
}

// 動作確認用（localhost のときだけ。公開サイトでは使わない）
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) globalThis.__zk = { S, toScr, svgRect };

// ---------- 起動：前回の作業があれば、最後の手順から再開する（F-011） ----------
(async () => {
  S.prefs = (await store.getPrefs()) ?? {};
  const saved = await store.getWork();
  if (saved?.image?.data) {
    try {
      const bmp = await decode(saved.image.data); S.disp = await displayImage(bmp); bmp.close?.();
      S.w = { ...newWork(), ...saved }; S.tab = saved.lastTab || "vert"; S.C = compute(S.w);
      S.msg = { text: "前回の作業を開きました" }; render(); requestAnimationFrame(fit); return;
    } catch { S.broken = saved; S.msg = { cls: "err", html: `前回の作業を開けませんでした（保存が壊れている可能性があります）。<div class="row" style="margin-top:6px"><button class="btn sm" data-act="brokenExport">書き出して残す</button><button class="btn sm danger" data-act="brokenDrop">破棄する</button></div>` }; }
  }
  render();
})();
