// 作業ファイル（.zakkuri.json）の形と検証（F-012・C-04）。DOMに依存しない部分
export const APP_ID = "zakkuri";
export const SCHEMA_VERSION = 1;

/** 読み込んだ JSON 文字列を検証する。成功なら { work }、失敗なら { code } */
export function parseWorkFile(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { code: "FILE_INVALID" }; }
  if (!d || typeof d !== "object") return { code: "FILE_INVALID" };
  if (d.appId !== APP_ID) return { code: "FILE_WRONG_APP" };
  if (!Number.isInteger(d.schemaVersion) || d.schemaVersion < 1 || d.schemaVersion > SCHEMA_VERSION) return { code: "FILE_SCHEMA_UNKNOWN" };
  const img = d.image;
  if (!img || typeof img.data !== "string" || !/^image\/(png|jpeg)$/.test(img.mime) || !(img.width > 0 && img.height > 0)) return { code: "FILE_INVALID" };
  if (!Array.isArray(d.vertices) || d.vertices.some((v) => !Number.isFinite(v?.x) || !Number.isFinite(v?.y) || typeof v.id !== "string")) return { code: "FILE_INVALID" };
  if (!d.rectify || typeof d.rectify.enabled !== "boolean") return { code: "FILE_INVALID" };
  if (!d.drawing || typeof d.drawing !== "object") return { code: "FILE_INVALID" };
  return { work: d };
}
