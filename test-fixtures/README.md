# 解析回帰テスト用の動画

ここに **人が登っている短い動画** と期待値ファイルを置くと、`pose-regression` ワークフロー
（`npm run e2e -- --grep @pose`）が実際に姿勢推定を行い、指標が範囲内かを確認します。

- 動画: `<名前>.mp4` / `.webm` / `.mov`（10〜20 秒程度、数 MB 以内を推奨。本人の許可がある動画のみ）
- 期待値: `<名前>.expected.json`（無ければ結果の JSON を出力するだけ）

```json
{
  "metrics": {
    "detectionRate": [0.8, 1],
    "straightArmRatio": [0.4, 1],
    "footHandRatio": [0.8, 3]
  },
  "adviceIncludes": ["straight-arm-good"],
  "adviceExcludes": ["capture", "fall"]
}
```

指標名は `src/analysis/types.ts` の `Metrics`、改善案の id は `src/analysis/rules.ts` を参照。
初回は期待値なしで実行し、Actions の artifact `pose-results` に出力された実測値を見て範囲を決めると楽です。
