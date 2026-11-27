// 保存した図面の一覧（最大20件）。図面だけを残す（公図の画像は残さない）。DOMに触らない
export const ARCHIVE_MAX = 20; // 【想定】発案者の指示「20件もあれば十分」

/** 作業データから、一覧に残す1件を作る（画像の中身は除く。大きさと名前だけ残す） */
export function makeEntry(work, C, id, savedAt) {
  const w = JSON.parse(JSON.stringify({ ...work, image: work.image ? { ...work.image, data: null } : null }));
  w.archiveId = id;
  return {
    id, savedAt,
    shozai: work.drawing.shozai || "", chiban: work.drawing.chiban || "", chimoku: work.chimoku || "",
    areaText: C?.chiseki?.text ?? null, kobo: work.refs?.area?.valueM2 ?? null,
    work: w,
  };
}

/**
 * 一覧に入れる。同じ id があれば置き換えて先頭へ。ARCHIVE_MAX を超えたら古いものから外す。
 * @returns {{list: object[], dropped: object[]}} list は新しい順
 */
export function upsert(list, entry, max = ARCHIVE_MAX) {
  const rest = list.filter((e) => e.id !== entry.id);
  const all = [entry, ...rest].sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  return { list: all.slice(0, max), dropped: all.slice(max) };
}
