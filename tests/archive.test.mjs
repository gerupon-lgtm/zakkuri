// 保存した図面の一覧（最大20件）
import test from "node:test";
import assert from "node:assert/strict";
import { makeEntry, upsert, ARCHIVE_MAX } from "../src/core/archive.js";

const work = (n) => ({ image: { name: "a.png", data: { big: true }, width: 10, height: 10 }, drawing: { shozai: "桑名市", chiban: `${n}` }, chimoku: "宅地", refs: { area: { valueM2: 100 } } });
const ts = (i) => new Date(Date.UTC(2026, 10, 28, 0, i)).toISOString();

test("画像の中身は残さず、大きさと名前は残す", () => {
  const e = makeEntry(work(1), { chiseki: { text: "99.99" } }, "id1", ts(0));
  assert.equal(e.work.image.data, null); assert.equal(e.work.image.width, 10); assert.equal(e.work.archiveId, "id1");
  assert.equal(e.areaText, "99.99"); assert.equal(e.kobo, 100); assert.equal(e.chiban, "1");
});
test("21件目を入れると、いちばん古い1件が外れる。新しい順に並ぶ", () => {
  let list = [];
  for (let i = 0; i < ARCHIVE_MAX; i++) ({ list } = upsert(list, makeEntry(work(i), null, `id${i}`, ts(i))));
  assert.equal(list.length, 20); assert.equal(list[0].id, "id19");
  const r = upsert(list, makeEntry(work(99), null, "id99", ts(30)));
  assert.equal(r.list.length, 20); assert.equal(r.list[0].id, "id99"); assert.deepEqual(r.dropped.map((e) => e.id), ["id0"]);
});
test("同じ図面を保存し直すと、増えずに置き換わって先頭に来る", () => {
  let { list } = upsert([], makeEntry(work(1), null, "a", ts(0)));
  ({ list } = upsert(list, makeEntry(work(2), null, "b", ts(1))));
  const r = upsert(list, makeEntry(work(3), null, "a", ts(2)));
  assert.equal(r.list.length, 2); assert.equal(r.list[0].id, "a"); assert.equal(r.list[0].chiban, "3"); assert.equal(r.dropped.length, 0);
});
