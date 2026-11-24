// 画像・PDFの読み込み（F-001・L-01）と、表示用の縮小画像・補正後の確認画像
import { applyH } from "../core/homography.js";

export const DISPLAY_LONG = 2400;  // 表示用の縮小画像の長辺（計算には元の座標を使う）
const PDF_DPI = 300;               // 【想定】L-01
const PDF_MAX_LONG = 8000;         // 【想定】L-01

let pdfjsP = null;
async function pdfjs() {
  if (!pdfjsP) pdfjsP = import("../../vendor/pdfjs/pdf.min.mjs").then((m) => { m.GlobalWorkerOptions.workerSrc = new URL("../../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href; return m; });
  return pdfjsP;
}
const err = (code) => Object.assign(new Error(code), { code });

export const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** 画像の Blob から ImageBitmap（EXIFの向きを反映） */
export async function decode(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); }
  catch {
    try { return await createImageBitmap(blob); } catch { throw err("IMAGE_INVALID"); }
  }
}

/** PDFを開く。{ doc, pages } */
export async function openPdf(file) {
  const m = await pdfjs();
  try {
    const doc = await m.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    return { doc, pages: doc.numPages };
  } catch (e) { throw err(e?.name === "PasswordException" ? "PDF_ENCRYPTED" : "PDF_INVALID"); }
}

/** PDFのページを画像（PNG）に。scale を省略すると 300dpi 相当 */
export async function renderPdfPage(doc, pageNo, thumb = false) {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  let scale = thumb ? 160 / Math.max(base.width, base.height) : PDF_DPI / 72;
  if (!thumb && Math.max(base.width, base.height) * scale > PDF_MAX_LONG) scale = PDF_MAX_LONG / Math.max(base.width, base.height);
  const vp = page.getViewport({ scale });
  const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  if (thumb) return c.toDataURL("image/png");
  const blob = await new Promise((res) => c.toBlob(res, "image/png"));
  c.width = c.height = 0;
  return blob;
}

/** 表示用に縮小した画像（object URL）と、その倍率 */
export async function displayImage(bitmap) {
  const k = Math.min(1, DISPLAY_LONG / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas"); c.width = Math.round(bitmap.width * k); c.height = Math.round(bitmap.height * k);
  c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
  const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
  return { url: URL.createObjectURL(blob), k, canvas: c };
}

/**
 * 補正後の確認画像。逆変換（補正後→元画像）と双線形補間で作る。
 * src: 表示用の縮小画像のキャンバス（倍率 k）。Hi: 補正後座標→元画像座標。
 */
export function rectifiedPreview(src, k, Hi, width, height, long = 1400) {
  const f = long / Math.max(width, height);
  const W = Math.round(width * f), Ht = Math.round(height * f);
  const sctx = src.getContext("2d"); const sd = sctx.getImageData(0, 0, src.width, src.height).data;
  const out = document.createElement("canvas"); out.width = W; out.height = Ht;
  const octx = out.getContext("2d"); const img = octx.createImageData(W, Ht); const od = img.data;
  const sw = src.width, sh = src.height;
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
    const p = applyH(Hi, { x: (x + 0.5) / f, y: (y + 0.5) / f });
    const sx = p.x * k - 0.5, sy = p.y * k - 0.5;
    const o = (y * W + x) * 4;
    if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) { od[o] = od[o + 1] = od[o + 2] = 235; od[o + 3] = 255; continue; }
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
    const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
    for (let ch = 0; ch < 3; ch++) od[o + ch] = (sd[i00 + ch] * (1 - fx) + sd[i10 + ch] * fx) * (1 - fy) + (sd[i01 + ch] * (1 - fx) + sd[i11 + ch] * fx) * fy;
    od[o + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out.toDataURL("image/jpeg", 0.85);
}

export async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()); let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
export function base64ToBlob(b64, mime) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: mime });
}
