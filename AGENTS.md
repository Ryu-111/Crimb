# AGENTS.md — Crimb 開発ガイド（Codex / Claude Code 共通）

ボルダリング動画をスマホで解析する PWA（+ Capacitor で Android APK）。UI 文言は日本語。

## コマンド

| 目的 | コマンド |
|---|---|
| 開発サーバー | `npm run dev` |
| 単体テスト | `npm test`（vitest, `src/**/*.test.ts`） |
| Lint / 型 | `npm run lint` / `npm run typecheck` |
| ビルド | `npm run build` |
| E2E | `npm run build && npm run e2e -- --grep-invert @pose` |
| APK 用同期 | `npm run cap:sync`（ビルドは Actions の `android.yml`） |

**コミット前に必ず `npm run lint && npm run typecheck && npm test && npm run build` を通すこと。**
UI を変えたら E2E（`e2e/app.spec.ts`）も更新・実行する。

## 構成

```
src/
  analysis/   姿勢時系列 → 指標・改善案（純粋関数。DOM 非依存。必ずテストを書く）
    types.ts      Frame / PoseTrack / Metrics / Advice
    geometry.ts   ランドマーク番号 LM、角度・距離、Pose ヘルパー、胴長正規化
    segments.ts   静止/移動区間、手足の移動イベント
    metrics.ts    analyze(track) → Analysis（指標の算出、落下検出）
    rules.ts      THRESHOLDS と buildAdvice（改善案。しきい値はここに集約）
    synthetic.ts  テスト用の合成クライマー climb({ bend, useFeet, pause, fall })
  pose/       MediaPipe（landmarker.ts）、動画→時系列（extractFrames.ts）、平滑化（smoothing.ts）
  db/db.ts    Dexie: sessions / tracks / videos（姿勢時系列と動画は別テーブル）
  routes/     画面（HashRouter）。Home / NewSession / Analyze / Result / Growth / Settings
  components/ VideoOverlay（骨格描画）, MetricGrid, AdviceList, Thumb
  lib/        draft（撮影〜保存までの一時状態）, format（指標の表示定義 METRICS）
e2e/          Playwright。@pose タグは実動画の解析回帰（test-fixtures/）
android/      Capacitor Android プロジェクト
```

## 規約

- TypeScript strict / `noUncheckedIndexedAccess`。`any` 禁止
- 座標: ランドマークは正規化画像座標（0..1、y 下向き）。距離・速度は **胴長（torsoLength）で正規化** してから閾値比較
- 指標を追加するときは `types.ts` の `Metrics` → `metrics.ts` → `lib/format.ts` の `METRICS` → テスト の順に
- 改善案を追加するときは `rules.ts` に id を付けて追加し、`metrics.test.ts` に合成データのテストを書く
- 保存済み記録は `SavedResult` で姿勢時系列から再解析する → 解析ロジック変更は過去記録にも反映される
- DB スキーマを変えるときは `db.version(n+1)` を追加（既存バージョンは書き換えない）
- Tailwind のみでスタイル。モバイル幅（~390px）で確認。ダーク（slate-900）基調、アクセントは `accent`（orange）
- 動画やユーザーデータを外部に送信するコードを追加しない
- 1 タスク = 1 PR。`docs/TASKS.md` のチェックを更新する
