// サクズ（gerupon-lgtm/sakuzu）SZ-0.5.0 の src/shared/date.js をコピーしたもの（C-05b: 案A。直すときはサクズ側にも反映する）
// 共通にする候補（C-04b）。日付だけの値は、日本時間のローカル日付で扱う
export function todayJst(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
const z2h = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[／－ー]/g, "/");
/** 入力中の整形: 8桁の数字を yyyy/MM/dd に */
export function formatTyping(text) {
  const t = z2h(text);
  const d = t.replace(/\D/g, "");
  if (/^\d{8}$/.test(t.trim())) return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
  return t;
}
/** 確定時の検証。成功なら {ymd:"yyyy-MM-dd"}、失敗なら {code:"DATE_INVALID"} */
export function parseDateInput(text) {
  const t = z2h(String(text).trim());
  let m = /^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/.exec(t) || /^(\d{4})(\d{2})(\d{2})$/.exec(t);
  if (!m) return { code: "DATE_INVALID" };
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { code: "DATE_INVALID" };
  return { ymd: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}
export const formatYmd = (ymd) => (ymd ? ymd.replaceAll("-", "/") : "");
