# ざっくり地積（zakkuri）

公図の画像（スキャン・写真・PDF）から縮尺を推定し、三斜法の概算求積表を付けた「現況図（概算）」を1枚の図面にするPWA。SIKUMI LAB。

- 状態: MVP ZC-0.2.0（読み込み → 補正 → 頂点 → 基準 → 三斜求積 → 図面のプレビューと印刷・PDF保存）。実機での確認待ち
- 共通部品: サクズ（gerupon-lgtm/sakuzu）SZ-0.5.0 の src/shared をコピーして使う（C-05b、案A）
- テスト: `TZ=UTC node --test tests/*.test.mjs`／合成画像の作り直し: `node scripts/make-test-images.mjs`
- 公開予定: `zakkuri.sikumilab.com`（GitHub Pages）
- 文書
  - docs/構想たたき台_ざっくり地積.md — 構想
  - docs/requirements.md — 要件定義書（機能IDの正典）
  - 基本設計サマリ.md — 設計判断の要約
  - docs/implementation-guide.md — 実装ガイド（CLAUDE.md・AGENTS.md の共通本文）
  - docs/logic-design.md・data-model.md・screens.md・tasks.md — 処理・データ・画面・タスク
