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
- [x] **テスト拡充**: `segments.ts` の境界値、`smoothing.ts` の長い欠損、`rules.ts` の各しきい値ちょうどのケース
- [x] **E2E 追加**: 全削除、成長グラフ表示、インポート（重複スキップ）・エクスポート（`e2e/backup.spec.ts`）

- [ ] **APK 版のバックアップ書き出し**: Android WebView は blob のダウンロード不可。`@capacitor/filesystem` + `@capacitor/share` で保存/共有（今は「アプリ版では未対応」と表示）

## Claude 向け

- [x] **タイムライン UI**: 動画の下に静止/移動区間と手足の移動イベント（`Analysis.stills / moves / limbMoves`）を帯で表示、タップでシーク
- [ ] **改善案ルールのチューニング**: 実際の登攀動画（`test-fixtures/` に追加）で `THRESHOLDS` を調整し、`*.expected.json` を作成
- [x] **壁の角度に応じたアドバイス**: `rules.ts` の `EMPHASIS`（スラブ=足・バランス重視、強傾斜=腕の伸び重視）
- [ ] **グレードに応じたアドバイス**: 実データでしきい値を決める必要あり（`test-fixtures/` 待ち）
- [x] **撮影ガイド（初回表示）**: 初回だけ撮影のコツを展開。検出率が低いときは既存の `capture` 改善案で案内
- [x] **解析前の全身チェック**: 動画全体から 6 フレームを抜き出して全身が映っているか確認し、足りなければ「撮り直す / このまま解析」
- [x] **解析中の画面スリープ防止**（Wake Lock）
- [ ] **解析の高速化**: Web Worker / OffscreenCanvas 化。実機で解析時間を測ってから判断
- [ ] **UX 全体の仕上げ**: 空状態、エラー表示、アクセシビリティ、iOS Safari での動画選択・シークの実機確認
- [x] **課題の 3D 表示**: 結果画面で課題のホールドを 1 つタップ → 同じ色のホールドを拾い、触れた順の番号・手足の経路・骨格を three.js で表示（`src/analysis/route.ts`, `src/components/Route3D.tsx`）
- [x] **振り返りの強化**: 部位の質量比による重心推定と軌跡、手足の軌跡、同じ課題の別トライの重ね合わせ（ホールドの位置で写真を合わせ、最初に触れた時刻で再生をそろえる）、選んだ課題の保存
- [x] **壁の凹凸（写真 1 枚から奥行き推定）**: Depth Anything V2 Small（int8、約 27MB、Apache-2.0）を onnxruntime-web で端末内実行し、3D の壁を凹凸のある面にする（`src/analysis/relief.ts`, `src/pose/depth*.ts`）。CI の `@pose depth` で実モデルを確認
- [ ] **課題の 3D 表示の改善**: 白・灰・黒のホールド（色差で判定）、壁の写真に使うコマの選択
- [x] **ムーブ単位の振り返り**: ムーブごとにサムネと所要時間を並べ、「一番苦戦したムーブ」を表示
