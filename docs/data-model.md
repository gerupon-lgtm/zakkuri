# データモデル

サーバーにはデータを持たない（C-01）。データは、端末内のIndexedDBと、利用者が書き出す作業ファイルの2か所にだけ置く。

## 作業（Work）— 作業ファイルとIndexedDBで同じ形

| 項目 | 型 | 必須 | 説明 |
|---|---|---|---|
| appId | `"zakkuri"` | ◯ | 別のアプリのファイルを取り違えないため（C-04）。v0.2 で追加 |
| schemaVersion | number | ◯ | データ形式の版。初期値は1。知らない版は読み込まない（C-04） |
| appVersion | string | ◯ | 保存したアプリの版（例: `ZC-0.1.0`） |
| savedAt | string | ◯ | 保存日時。UTCのISO 8601（例: `2026-11-21T11:00:00.000Z`） |
| image.name | string | ◯ | 元のファイル名 |
| image.mime | string | ◯ | `image/jpeg` / `image/png`。PDFは変換後の `image/png` |
| image.data | Blob（IndexedDB）／base64文字列（ファイル） | ◯ | 元の画像（PDFの場合は変換した画像） |
| image.width / height | number | ◯ | 元画像の大きさ（px） |
| image.source | `"image"` \| `"pdf"` | ◯ | 読み込み元の種類 |
| image.pdfPage | number | — | PDFのページ番号 |
| rectify.enabled | boolean | ◯ | 台形補正の有無 |
| rectify.corners | {x,y}[4] | — | 四隅（元画像座標。左上→右上→右下→左下） |
| rectify.paper | `"A4"` \| `"A3"` \| `"B4"` \| `"unknown"` | — | 用紙の種類 |
| rectify.orientation | `"portrait"` \| `"landscape"` | — | 用紙の向き |
| vertices | {id, x, y}[] | ◯ | 土地の頂点（元画像座標）。並び順が外周の順番 |
| closed | boolean | ◯ | 外周を閉じたか（ZC-0.1.0 で追加） |
| lastTab | string | — | 再開するときに開く手順（load/rect/vert/ref/tri/info。ZC-0.1.0 で追加） |
| lengthMode | "image" \| "input" | — | 求積に使う長さ（F-019。ないときは "image"。ZC-0.5.0 で追加） |
| archiveId | string | — | 保存した図面の一覧に入れたときのID。保存し直すと同じ1件を置き換える（ZC-0.4.0 で追加） |
| north | {x1,y1,x2,y2} | — | 北の向きを示す矢印（元画像座標）。始点→終点が北 |
| refs.lengths | {id, p1:{x,y}, p2:{x,y}, v1?, v2?, lengthM}[] | — | 辺の長さの基準（元画像座標と、実際の長さ）。v1・v2 は頂点のID。頂点に付いた基準は、頂点を動かすと一緒に動き、頂点を消すと消える（ZC-0.1.0 で追加） |
| refs.area | {valueM2, chisekiChosa} | — | 公簿面積と、地籍調査済みかどうか |
| chimoku | string | ◯ | 地目（L-06の23種のいずれか） |
| anisotropic | boolean | ◯ | 縦横別の縮尺を使うか。既定は false |
| triangles | [i,j,k][] | — | 頂点の番号の組。未設定なら自動分割する |
| drawing.shozai / chiban | string | — | 所在・地番 |
| drawing.officeName / author | string | — | 事務所名・作成者 |
| drawing.createdDate | string | ◯ | 作成日。JSTのローカル日付を `yyyy-MM-dd` で持つ（日付だけの値） |
| drawing.paper | `"A4"` \| `"A3"` | ◯ | 図面の用紙。既定はA4（向きは横で固定） |
| drawing.rotationDeg | number | ◯ | 図面の回転角度（度、−180〜180、既定0）。見た目だけで、頂点の座標は変えない（v0.6 で追加） |
| drawing.showBackground | boolean | ◯ | 図面に公図の画像を薄く重ねるか。既定は false |

- 計算結果（縮尺・面積・三斜表）は保存せず、毎回入力から計算し直す。保存した値と計算結果が食い違わないようにするためである。
- 作業ファイル: 拡張子は `.zakkuri.json`【想定】。中身は上の項目のJSONで、画像はbase64で持つ。

## IndexedDB

| DB / ストア | キー | 内容 |
|---|---|---|
| `zakkuri` / `work` | `"current"` | 作業中のWork（1件だけ）。入力が変わるたびに、少し待ってから保存する（目安500ms）【想定】 |
| `zakkuri` / `prefs` | `"defaults"` | 前回入力した事務所名・作成者 |

- 「新しい作業」を始めるときは、確認ダイアログを出してから `current` を置き換える。
- 保存に失敗した場合（容量の不足など）は、画面上部に「端末への保存に失敗しました。作業ファイルを書き出してください」と表示する。

## 読み込み時の検証（作業ファイル）

1. JSONとして読めない → `FILE_INVALID`
2. appId が `"zakkuri"` でない → `FILE_WRONG_APP`（現在の作業は保つ）
3. schemaVersion がない、またはアプリが知っている版より大きい → `FILE_SCHEMA_UNKNOWN`（現在の作業は保つ）
4. 必須項目が欠けている、または型が違う → `FILE_INVALID`
5. 問題がなければ、確認してから現在の作業と置き換える。

## 保存した図面の一覧（IndexedDB `zakkuri` の版2、ストア `drawings`、キー `list`。ZC-0.4.0 で追加）

新しい順の配列。最大20件（`src/core/archive.js` の ARCHIVE_MAX）。1件の形:

| 項目 | 型 | 内容 |
|---|---|---|
| id | string | 一覧のID（作業データの archiveId と同じ） |
| savedAt | string | 保存日時（UTCのISO 8601） |
| shozai・chiban・chimoku | string | 一覧に表示する所在・地番・地目 |
| areaText | string \| null | 概算面積（端数処理後） |
| kobo | number \| null | 公簿面積 |
| work | object | 作業データの写し。`image.data` は null（公図の画像は残さない） |
