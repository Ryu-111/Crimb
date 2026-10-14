# jev-router + Codex で開発する

[jev-router](https://github.com/gargpratyush/jev-router) は手元で動く中継プロキシで、メッセージごとに
Jev に処理の重さを判定させ、適したモデルに振り分けます。Claude Code 用の `jev-claude` と
Codex 用の `jev-codex` があります。

> インストール方法・API キーの設定方法は変わる可能性があるため、**jev-router リポジトリの README に従ってください**。
> 必要なもの: Jev の API キー、Claude Code（Anthropic アカウント）、Codex CLI（OpenAI アカウント）。

## 準備

```bash
git clone https://github.com/<あなたのユーザー名>/Crimb.git
cd Crimb
npm ci
npm test && npm run build   # 動くことを確認
```

jev-router をインストールし、README の手順で Jev の API キーを設定したら、このディレクトリで起動します。

```bash
jev-claude   # Claude Code（CLAUDE.md → AGENTS.md を読む）
jev-codex    # Codex（AGENTS.md を読む）
```

## プラグイン（Ponytail + Context Mode）

| プラグイン | 役割 |
|---|---|
| [Ponytail](https://github.com/DietrichGebert/ponytail) | 必要最小限のコードで解く方針をエージェントに徹底させる（MIT） |
| [Context Mode](https://github.com/mksglu/context-mode) | テスト結果・ログ・Playwright のスナップショットなど大きな出力を要約し、コンテキストを節約する MCP（Elastic-2.0、Node.js 22.5+ が必要） |

**Claude Code（`jev-claude`）**: `.claude/settings.json` に登録済み。リポジトリを開いて信頼すると、両方のインストールを求められます。手動なら:

```
/plugin marketplace add DietrichGebert/ponytail
```
```
/plugin install ponytail@ponytail
```
```
/plugin marketplace add mksglu/context-mode
```
```
/plugin install context-mode@context-mode
```

（1 コマンドずつ送る。入れたら `/reload-plugins`、確認は `/context-mode:ctx-doctor`）

**Codex（`jev-codex`）**: Codex はリポジトリ設定から自動では入らないので、各自で 1 回だけ実行:

```bash
codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail
codex plugin marketplace add mksglu/context-mode   # Codex のプラグイン画面から context-mode をインストール
```

`~/.codex/config.toml` でプラグインのフックを有効化:

```toml
[features]
plugin_hooks = true
hooks = true
```

その後 `codex` で `/hooks` を開いて両プラグインのフックを信頼し、新しいスレッドを開始。
手順は変わることがあるので、うまくいかなければ各プラグインの README を参照してください。
Ponytail の方針は `AGENTS.md` にも要約しているので、プラグインが無くても同じルールで動きます。

## 分担の流れ

1. [docs/TASKS.md](TASKS.md) から 1 つ選び、ブランチを切る（例: `feat/growth-chart`）
2. 担当の目安に沿って `jev-codex` か `jev-claude` に依頼する。依頼文の例:
   - Codex: 「docs/TASKS.md の『成長グラフ』を実装して。AGENTS.md の規約に従い、lint/typecheck/test/build を通してからコミット」
   - Claude: 「docs/TASKS.md の『タイムライン UI』を設計から考えて実装して」
3. もう一方にレビューさせる（例: Codex の実装を `jev-claude` で「この差分をレビューして」）
4. push して PR を作成 → Actions（CI / E2E / Lighthouse / プレビュー URL / APK）を確認
5. プレビュー URL をスマホで開いて実機確認 → マージ → TASKS.md にチェック

## ヒント

- 両方のエージェントが同じ `AGENTS.md` を読むので、規約を変えたら `AGENTS.md` だけ更新する
- 解析ロジック（`src/analysis/`）は DOM 非依存の純粋関数なので、まずテストを書かせると精度が上がる
- 実動画で検証したいときは `test-fixtures/` に動画を置き、`npx playwright test --grep @pose --project android`
