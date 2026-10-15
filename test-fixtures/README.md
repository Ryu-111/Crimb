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

## 同梱している動画と姿勢データ

| ファイル | 内容 |
|---|---|
| `garrett.webm`, `eric.webm` | ジムでのボルダリング（背面から撮影・手持ちで追従）。CI の解析回帰テスト用 |
| `garrett.pink-holds.json` | garrett の最初のコマで下の大きいピンクをタップしたときに拾われるホールド（`src/analysis/route.test.ts` で使用） |
| `tracks/*.json` | 上の動画から本アプリで抽出した姿勢時系列。`src/analysis/realtracks.test.ts`（ブラウザ不要の単体テスト）で使用 |

出典: [imix8/Ascend](https://github.com/imix8/Ascend) の `assets/*.mp4`（MIT License, Copyright (c) 2024 imix8）。
テスト用ブラウザ（Chromium）が H.264 を再生できないため VP8/WebM に変換し、音声を除いています。

```
ffmpeg -i garrett.mp4 -an -c:v libvpx -b:v 1M garrett.webm
```

姿勢データの作り直し: `POSE_FIXTURES_DIR=<動画のフォルダ> npx playwright test --grep @pose --project android` を実行すると
`pose-results/<名前>.track.json` が出力されるので、`tracks/<名前>.json` にコピーします。
