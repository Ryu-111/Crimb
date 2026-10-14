# Crimb 🧗

ボルダリングの登りをスマホで撮影し、**ムーブを解析して改善案を出し、成長を記録する** PWA / Android アプリ。

**▶ アプリを開く: https://ryu-111.github.io/Crimb/** （スマホで開いて「ホーム画面に追加」）
Android アプリ（APK）は [Actions の Android APK](https://github.com/Ryu-111/Crimb/actions/workflows/android.yml) の最新の成功した実行の Artifacts からダウンロードできます。

[![Deploy](https://github.com/Ryu-111/Crimb/actions/workflows/deploy.yml/badge.svg)](https://github.com/Ryu-111/Crimb/actions/workflows/deploy.yml)
[![CI](https://github.com/Ryu-111/Crimb/actions/workflows/ci.yml/badge.svg)](https://github.com/Ryu-111/Crimb/actions/workflows/ci.yml)

- 📱 スマホ前提（iPhone / Android のブラウザでホーム画面に追加、または Android APK）
- 🔒 姿勢推定（MediaPipe Pose）は **端末内で実行**。動画は外部に送信しない
- 💡 指標（ストレートアーム率・足/手の動き比・静止時間・重心の効率・横ブレ・落下地点など）からルールベースで改善案
- 📈 記録は端末内（IndexedDB）に保存し、同じ課題の前回と比較

## 使い方

1. 「＋ 動画を解析する」→ 撮影 or 動画を選択
2. 課題名・グレード・壁の角度・完登/トライを入力して「解析スタート」
3. 改善ポイントをタップすると該当シーンへジャンプ。「記録を保存」で履歴へ

**撮影のコツ**: スマホを固定 / 壁の正面から / 手足の先まで全身が常に入るように / 縦向き

## 開発

```bash
npm ci
npm run dev          # http://localhost:5173 （スマホ実機は `npm run dev -- --host`）
npm test             # 解析ロジックの単体テスト (vitest)
npm run lint && npm run typecheck
npm run build        # dist/ に PWA を出力
npm run e2e          # Playwright（要 build）
```

MediaPipe の wasm とモデルは `npm run dev` / `npm run build` の前に `scripts/fetch-models.mjs` が
`public/mediapipe/` に配置します（リポジトリにはコミットしません）。

構成・規約は [AGENTS.md](AGENTS.md)、残タスクは [docs/TASKS.md](docs/TASKS.md)、
jev-router + Codex での開発手順は [docs/jev-router.md](docs/jev-router.md) を参照。

## GitHub Actions

| ワークフロー | タイミング | 内容 |
|---|---|---|
| CI | push(main) / PR | lint → 型チェック → 単体テスト（カバレッジをサマリーに表示）→ ビルド |
| E2E | push(main) / PR | Playwright で Android・iPhone 画面サイズの操作テスト。スクリーンショットを artifact に |
| Pose regression | 解析コード変更時 | `test-fixtures/` の実動画を解析して指標の劣化を検知 |
| Lighthouse | PR | モバイルのパフォーマンス/アクセシビリティを計測して PR にコメント |
| Deploy | push(main) | GitHub Pages に公開 |
| PR preview | PR | `…/pr-preview/pr-<番号>/` にプレビューを公開して URL をコメント |
| Android APK | push(main) / PR | debug APK を artifact に |
| Release | `v*` タグ | 署名済み APK / AAB を作って GitHub Release に添付 |
| Dependabot | 毎週 | 依存パッケージ・Actions の更新 PR |

### 初回セットアップ（リポジトリ設定）

1. **Settings → Actions → General → Workflow permissions** を「Read and write permissions」に
2. main に一度 push して Deploy を走らせ、`gh-pages` ブランチを作る
3. **Settings → Pages → Build and deployment → Source** を「Deploy from a branch」、Branch を `gh-pages` / `(root)` に
4. 公開 URL: `https://<ユーザー名>.github.io/Crimb/`（スマホで開いて「ホーム画面に追加」）

### APK の署名（任意）

Secrets 未設定でもリポジトリに同梱の固定 debug 鍵（`android/app/debug.keystore`）で署名された APK が作られ、上書きインストールできます。
アップデートを継続配布するなら固定の鍵を作って Secrets に登録してください。

```bash
keytool -genkeypair -v -keystore crimb.keystore -alias crimb -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 crimb.keystore   # 出力を ANDROID_KEYSTORE_BASE64 に
```

Secrets: `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`

リリース: `git tag v0.1.0 && git push origin v0.1.0` → Releases に APK が添付されます。
iPhone は App Store 配布に Apple Developer 登録が必要なため、PWA として利用してください。
