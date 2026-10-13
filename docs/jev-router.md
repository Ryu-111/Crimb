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
