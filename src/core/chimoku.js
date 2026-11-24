// L-06 地目と、地目による地積の端数処理（不動産登記規則100条）。DOMに触らない純粋な計算

/** 地目（不動産登記事務取扱手続準則68条の23種） */
export const CHIMOKU = ["田", "畑", "宅地", "学校用地", "鉄道用地", "塩田", "鉱泉地", "池沼", "山林", "牧場", "原野", "墓地", "境内地", "運河用地", "水道用地", "用悪水路", "ため池", "堤", "井溝", "保安林", "公衆用道路", "公園", "雑種地"];
const FINE = new Set(["宅地", "鉱泉地"]);

/**
 * 倍面積の合計 T（cm²、整数）から地積を求める。
 * @returns {{code?:string, value?:number, digits?:0|2, text?:string}}
 */
export function truncateArea(T, chimoku) {
  if (!CHIMOKU.includes(chimoku)) return { code: "CHIMOKU_REQUIRED" };
  if (!Number.isInteger(T) || T < 0) return { code: "AREA_INVALID" };
  // 面積の元の値は T/2（cm²）。0.5 が出ても整数の割り算だけで切り捨てる
  if (FINE.has(chimoku) || T <= 200000) { const v = Math.floor(T / 200); return { value: v / 100, digits: 2, text: `${Math.floor(v / 100)}.${String(v % 100).padStart(2, "0")}` }; }
  const v = Math.floor(T / 20000);
  return { value: v, digits: 0, text: String(v) };
}
