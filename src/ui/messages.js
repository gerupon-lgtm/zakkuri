// 画面に出す文言（エラーコードと分けて管理する。文言の変更はA区分）
export const MSG = {
  SCALE_NO_REFERENCE: "辺の長さか面積を1つ以上入力してください",
  AREA_NEEDS_POLYGON: "面積を基準にするには、③で外周を閉じてください",
  POLY_TOO_FEW: "頂点を3つ以上置いてください",
  POLY_SELF_INTERSECT: "外周の線が交差しています。頂点の順番か位置を直してください",
  POLY_ZERO_AREA: "頂点が一直線に並んでいて、面積がありません",
  QUAD_DEGENERATE: "四隅の指定が正しくありません",
  ANISO_INSUFFICIENT: "縦横別の縮尺は推定できません（材料不足）",
  ANISO_LARGE_RATIO: "縦と横の縮尺が3%以上違います。公図の歪みか、基準の入力を確かめてください",
  REF_SAME_POINT: "基準の2点が同じ位置です",
  REF_NON_POSITIVE: "長さ・面積は0より大きい数値で入れてください",
  ADJUST_INCONSISTENT: "入力した長さどうしが合わず、すべてを満たす形にできませんでした。入力値を確かめてください",
  ADJUST_BROKE_SHAPE: "入力した長さに合わせると線が交差するため、画像から求めた長さで求積しています。入力値を確かめてください",
  FLIP_NOT_CONVEX: "この対角線は入れ替えられません（四角形が凹んでいるため）",
  FLIP_NOT_DIAGONAL: "対角線をタップしてください",
  CHIMOKU_REQUIRED: "④で地目を選ぶと、地積（端数処理後）を表示します",
  PDF_ENCRYPTED: "パスワードのかかったPDFは読み込めません",
  PDF_INVALID: "PDFを読み込めませんでした（ファイルが壊れている可能性があります）",
  IMAGE_INVALID: "画像を読み込めませんでした。JPEG・PNG・PDFを選んでください",
  FILE_INVALID: "ファイルが壊れているか、形式が違います",
  FILE_WRONG_APP: "このファイルはざっくり地積の作業ファイルではありません",
  FILE_SCHEMA_UNKNOWN: "このファイルは新しい版のアプリで作られています。アプリを更新してください",
  DATE_INVALID: "日付が正しくありません（例: 2026/11/25）",
  SAVE_FAILED: "端末への保存に失敗しました。作業ファイルを書き出してください",
};
export const msgOf = (code) => MSG[code] ?? code;
export const NOTICE = "公図等から推定した概算であり、測量成果ではありません";
