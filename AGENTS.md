# AGENTS.md — Crimb 開発ガイド（Codex / Claude Code 共通）

ボルダリング動画をスマホで解析する PWA（+ Capacitor で Android APK）。UI 文言は日本語。

## 引き継ぎ（Claude Code と Codex の両方で作業する）

- **作業を始めたら最初に [docs/HANDOFF.md](docs/HANDOFF.md) を読む**。進行中の PR・判断待ち・次の一手が書いてある
- **作業を終える前（push する前）に docs/HANDOFF.md の「現在」を更新する**。ブランチ・PR 番号・最後に通したチェック・測った数値（測り方も）を書く
- 完了したタスクは [docs/TASKS.md](docs/TASKS.md) にチェックを付ける（HANDOFF には残さない）
- 同じブランチを 2 つのエージェントで同時に触らない。HANDOFF の「進行中」にあるブランチは、そこに書かれた作業が終わるまで引き継いだ側だけが触る

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
  pose/       MediaPipe（landmarker.ts）、YOLO-pose（yolo.ts。MediaPipe が見失う人を補う。合成は analysis/hybrid.ts）、動画→時系列（extractFrames.ts）、平滑化（smoothing.ts）、壁の奥行き推定（depth.ts + depthWorker.ts）
  db/db.ts    Dexie: sessions / tracks / videos（姿勢時系列と動画は別テーブル）
  routes/     画面（HashRouter）。Home / NewSession / Analyze / Result / Problem（同一課題の比較） / Growth / Settings
  components/ VideoOverlay（骨格描画）, Timeline, MoveList, MetaFields（課題情報の入力・GRADES/ANGLES）, MetricGrid, AdviceList, Thumb
  lib/        draft（撮影〜保存までの一時状態）, format（指標の表示定義 METRICS）
e2e/          Playwright。@pose タグは実動画の解析回帰（test-fixtures/）
android/      Capacitor Android プロジェクト
```

## 開発スタイル（Ponytail）

[Ponytail](https://github.com/DietrichGebert/ponytail) の方針で書く（Claude Code はプラグインが自動で有効になる）。

- 頼まれていない機能・オプション・抽象化は作らない。既存のコード → 標準/ブラウザ機能 → 導入済み依存 の順に使う
- 依存を数行のために追加しない。最短で読みやすい差分を選ぶ
- ただし検証・エラー処理・アクセシビリティ・テストは削らない（非自明なロジックには小さなテストを付ける）
- 既知の制限がある近道には `// shortcut: <制限>, <いつ直すか>` コメント

## 厳密な作業手順（pstack）

Claude Code では [pstack](https://github.com/cursor/plugins/tree/main/pstack)（MIT）も自動で有効になる。`/pstack:poteto-mode` で作業に合う手順（バグ修正・機能追加・性能改善・PR の見守りなど）を選んで進める。

- このファイルの規約が pstack より優先する。特に次の 3 点
  - コミットと PR は日本語で書く（pstack の Conventional Commits 形式の英語タイトルにはしない）
  - `// shortcut:` コメントは残す（`no-comments` スキルの対象外）
  - 1 タスク = 1 PR
- 既定で Grok などに振り分ける手順は、Claude Code ではセッションのモデルで動く。`/pstack:setup-pstack` は Claude Code では何も設定しない
- Codex では使えない

## セキュリティ確認（Claude Security）

Claude Code では [claude-security](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-security) プラグインが自動で有効になる（`.claude/settings.json`）。プラグイン本体はライセンス上リポジトリに複製しない。

- 次の変更を含む PR では、push 前に `/claude-security` の **Scan changes**（ブランチの差分）を実行する
  - 外部への通信（`fetch`・Worker・Service Worker のキャッシュ規則）
  - 取り込み・復元（バックアップの読み込みなど、外から来たデータを DB に入れる処理）
  - 依存の追加
- 全体スキャン（Scan codebase）は大きな機能を入れた後に必要なときだけ実行する。時間とトークンを使う
- 結果は `CLAUDE-SECURITY-<時刻>/` に出る。`.gitignore` 済みで、コミットしない。見つかった問題は通常の修正として直す
- Codex では使えない。代わりに上の観点で差分を目視確認する

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
