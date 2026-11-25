# ざっくり地積（zakkuri）実装ガイド（共通本文）

AGENTS.md（Codex）と CLAUDE.md（Claude Code）は、どちらもこのファイルを参照する。規約はここだけに書き、入口ファイルに複製しない。

## 概要

公図の画像（スキャン・写真・PDF）から縮尺を推定し、三斜法の概算求積表を付けた「現況図（概算）」を1枚の図面として出力するPWA。税理士法人の業務で使う。処理はすべてブラウザの中で行い、外部へは何も送らない。

## 前提（仮置き）

以下は【想定】の値で、実装中に変わることがある。変えたときは、括弧内の文書も合わせて更新する。

- 版の接頭辞は `ZC`（docs/requirements.md の15.1）
- PDFは300dpi相当で画像にする（docs/logic-design.md のL-01）
- 台形補正後の画像は、長辺4000pxにする（docs/logic-design.md のL-02）
- 縦横別の縮尺の判定値は、30°と±3%（docs/logic-design.md のL-04）
- アイコンはLucideを使う（docs/screens.md の「デザイントークン」。後でモックを比べて確定する）
- 作業ファイルの拡張子は `.zakkuri.json`（docs/data-model.md）

## 技術スタック

- 素のJavaScript（ES Modules）とHTML・CSS。ビルドの工程は入れない。npmはテストだけに使う
- 図はSVGで描く。画像の処理にはCanvasを使う
- PDFの読み込みにはPDF.jsを使う。`vendor/pdfjs/` に同梱し、CDNから読み込まない
- 図面のPDFは、ブラウザの印刷機能（`window.print()` と印刷用CSS）で作る
- 作業の保存にはIndexedDBを使う。PWAにはService Workerを使う
- テストは `node --test`（Node 20以上）で行う
- 公開先はGitHub Pages（リポジトリ zakkuri、`zakkuri.sikumilab.com`）
- UI: サクズと見た目と操作をそろえる（詳細は docs/screens.md）。書体は BIZ UDPゴシックを `fonts/` に同梱する
- 共通部品: サクズの `src/shared/`（幾何・丸め・回転・印刷・日付・SIMA/CSV/DXFの読み取り）を使う。2026-11-25 の T-000 で「コピーして使う」に決めた（C-05b）。コピーしたファイルの先頭にコピー元の版を書き、直すときはサクズにも反映する。どちらの場合も、アプリ側で同じ計算を作り直さない

## ディレクトリ構成

```
index.html / manifest.webmanifest / sw.js / CNAME
src/app.js            起動、画面の状態管理
src/version.js        版の正典（APP_VERSION）
src/core/             ざっくり地積だけの計算（DOMに触らない。node --test で検証する）
  homography.js scale.js triangulate.js sansha.js chimoku.js
src/shared/ または vendor/  サクズと共通の部品（置き場所は T-000 で決める。C-05b）
scripts/sync-core.mjs     共通モジュールにした場合だけ: 取り込みと、書き換えの検出
src/io/               画像・PDFの読み込み、IndexedDB、作業ファイル
src/ui/               画面・SVGの描画・操作
vendor/pdfjs/ vendor/lucide/
tests/                *.test.mjs
scripts/              テスト画像の生成、版の同値チェック
docs/                 要件・設計
```

## 規約

- `src/core/` は純粋な関数だけにし、DOM・Canvas・IndexedDBを使わない。計算はすべてここに置き、テストを付ける
- 長さ・面積の端数処理は、浮動小数点ではなく整数（cm、cm²）で行う（L-06）
- コミットメッセージに、docs/tasks.md のタスクID（例: `T-005`）を入れる
- 利用者に表示する文言は日本語にする。エラーには `code` を持たせ、表示する文言とは分ける（docs/logic-design.md）

## バージョン管理

- 形式: `ZC-MAJOR.MINOR.PATCH`（現在の版: `ZC-0.3.0`）
- 上げ方: PATCHは小さな修正、MINORは互換性のある機能の追加、MAJORは作業ファイルの互換性が壊れる変更。MINORを上げたらPATCHを0に、MAJORを上げたらMINORとPATCHを0に戻す
- 正典: `src/version.js` の `APP_VERSION`
- 反映先: 画面のフッタ、`sw.js` のキャッシュ名、作業ファイルの `appVersion`
- 同値の確認: `node scripts/check-version.mjs`（サクズと同じ仕組み）を実行する。CIでも実行し、`sw.js` の版と食い違ったら失敗させる。共通モジュールにした場合は、あわせて取り込んだ部品が書き換えられていないかを確かめる

## 日時・タイムゾーン

- 扱う日時は2つだけ。作成日（日付だけ）と、作業ファイルの保存日時
- 作成日: 日本時間のローカル日付を、`yyyy-MM-dd` の文字列で保持する。画面と図面には `yyyy/MM/dd` で表示する。「今日」の求め方は共通部品（サクズの `src/shared/date.js`）を使い、入力欄はサクズの作成日の入力欄と同じ作りにする
- 保存日時（`savedAt`）: UTCのISO 8601で保存する（`new Date().toISOString()`）
- やってはいけないこと:
  - 端末のローカル時刻で日付を決める
  - `new Date('2026-11-21')` のように、文字列を暗黙に解釈させる
  - `+09:00` を直接書き込む
- テスト: CIは `TZ=UTC` で実行する。JSTの0時をまたぐ時刻（UTCの14:59と15:00）、月末、年末の境界を必ずテストする

## コマンド

- 開発サーバー: `npx serve .`（Service Workerを動かすため、localhostで開く）
- テスト: `TZ=UTC node --test tests/`
- 版の確認: `node scripts/check-version.mjs`
- Service Worker の作り直し（版を上げた・ファイルを足したとき）: `node scripts/make-sw.mjs`
- 外部への通信の確認（C-01）: `node scripts/check-no-external.mjs`

## 実装上の注意

- スマホの写真（約1,200万画素）を読み込んでも、頂点の操作が引っかからないようにする。表示には縮小した画像を使い、計算には元の座標を使う
- 頂点は**元画像の座標**で保存する。台形補正の四隅を直しても、頂点が失われないようにするため（docs/logic-design.md のL-02）
- 指で頂点を置けるように、拡大鏡（ルーペ）と微調整の操作を付ける
- 画像は縦横比を保ち、トリミングしない

## 変更禁止事項（根拠つき）

docs/requirements.md の0章に従う。
- A（画面の配置・文言・色など）は、発案者の指示ですぐに変えてよい。文書の更新は任意。
- B（機能・既定値・閾値など）は、変えてよいが、requirements.md の改訂履歴に記録する。
- 次のCだけは、文書を改訂して合意してからでないと変えない。

| ID | 内容 | 理由 |
|---|---|---|
| C-01 | 画像・入力内容・計算結果を外部へ送らない。`fetch`・XHR・WebSocket・送信ビーコンの宛先は、自分のオリジンの静的ファイルだけにする。CDNやアクセス解析は入れない | 顧問先の土地情報を守るため |
| C-02 | URL（クエリ文字列・ハッシュを含む）に作業データを入れない | 閲覧履歴やチャットのログに残るのを防ぐため |
| C-03 | 図面には、注意書き「公図等から推定した概算であり、測量成果ではありません」と、縮尺の算出に使った基準を必ず載せる | 正式な地積測量図と誤解されるのを防ぐため |
| C-04 | 作業ファイルに `schemaVersion` と `appId: "zakkuri"` を持たせる。知らない版や別のアプリのファイルは読み込みを中止し、現在の作業を上書きしない | データの消失を防ぐため |
| C-05b | 着手時に、サクズの `src/shared/` を共通モジュールとして切り出すか、コピーして使うかを判断する。共通モジュールにした場合は、版を固定して取り込み、直接書き換えない | サクズと部品の中身が食い違わないようにするため（C-05 は 2026-11-21 に失効） |

## 検証済みの事実

| 事実 | 確認方法 | 根拠 | 確認日 |
|---|---|---|---|
| 地積の端数: 宅地・鉱泉地は0.01㎡未満を切り捨てる。それ以外の地目は、10㎡を超えるものは1㎡未満を切り捨てる | 条文の確認（二次資料による。e-Govの原文との照合はT-006で行う） | 不動産登記規則100条 | 2026-11-21 |

## 参照

- 要件: docs/requirements.md（機能IDはここを正とする）
- 設計: docs/logic-design.md（計算）、docs/data-model.md、docs/screens.md、docs/tasks.md
- 共通部品: サクズ（gerupon-lgtm/sakuzu）の src/shared/ と docs/implementation-guide.md
