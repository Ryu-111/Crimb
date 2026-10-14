# 残タスク

1 タスク = 1 PR。担当の目安:
- **Codex**（`jev-codex`）: 仕様がはっきりしていて、既存パターンに沿って書ける作業
- **Claude**（`jev-claude`）: 設計判断・UX・解析ロジックのチューニングを伴う作業

PR を出すと CI / E2E / Lighthouse / プレビュー / APK が自動で走るので、結果を見てからマージ。

## 実装済み（土台）
- [x] PWA 雛形（Vite + React + TS + Tailwind、オフライン、ホーム画面追加）
- [x] MediaPipe 姿勢推定（端末内、GPU→CPU フォールバック、同梱→CDN フォールバック）
- [x] 解析ロジック（静止/移動区間・手足の移動・指標 10 種・落下検出・改善案）+ 単体テスト
- [x] 結果画面（骨格オーバーレイ・改善案から該当シーンへジャンプ・指標の前回比）
- [x] 保存（IndexedDB、動画保存は任意）・履歴一覧（最小版）・成長（最小版）
- [x] Capacitor Android、GitHub Actions 一式、Dependabot
- [x] Ponytail + Context Mode プラグインを `.claude/settings.json` に登録（手順は docs/jev-router.md）

## Codex 向け

- [x] **成長グラフ**（`src/routes/Growth.tsx`）: `chart.js` + `react-chartjs-2`（導入済み）で、`METRICS` の各指標の推移を折れ線表示。指標を選ぶタブ、期間フィルタ（1 か月 / 3 か月 / 全期間）
- [x] **同一課題の比較**: 課題名ごとにセッションをまとめ、指標を横並び比較する画面（`/problem/:name`）
- [x] **エクスポート / インポート**（`src/routes/Settings.tsx`）: sessions + tracks を JSON でダウンロード（Blob の thumbnail は base64 化）、読み込み時は重複（createdAt + problemName）をスキップ。動画は含めない
- [x] **全データ削除**（設定画面、確認ダイアログ付き）と、使用容量の表示（`navigator.storage.estimate()`）
- [x] **履歴の絞り込み**: グレード・完登/トライ・課題名検索
- [x] **記録の編集**: 課題名・グレード・メモを保存後に変更（`SessionMeta.notes` は入力 UI 未実装）
- [ ] **テスト拡充**: `segments.ts` の境界値、`smoothing.ts` の長い欠損、`rules.ts` の各しきい値ちょうどのケース
- [x] **E2E 追加**: 全削除、成長グラフ表示、インポート（重複スキップ）・エクスポート（`e2e/backup.spec.ts`）

## Claude 向け

- [x] **タイムライン UI**: 動画の下に静止/移動区間と手足の移動イベント（`Analysis.stills / moves / limbMoves`）を帯で表示、タップでシーク
- [ ] **改善案ルールのチューニング**: 実際の登攀動画（`test-fixtures/` に追加）で `THRESHOLDS` を調整し、`*.expected.json` を作成
- [ ] **壁の角度・グレードに応じたアドバイス**: 例: 強傾斜ではストレートアームより体幹の指摘を優先、スラブでは足の精度を重視
- [ ] **撮影ガイド**: 初回起動時のオンボーディング、解析前に全身が映っているかを最初の数フレームでチェックして警告
- [ ] **解析の高速化**: 長い動画で Web Worker / OffscreenCanvas 化、解析中の画面スリープ防止（Wake Lock）
- [ ] **UX 全体の仕上げ**: 空状態、エラー表示、アクセシビリティ、iOS Safari での動画選択・シークの実機確認
- [x] **ムーブ単位の振り返り**: ムーブごとにサムネと所要時間を並べ、「一番苦戦したムーブ」を表示
