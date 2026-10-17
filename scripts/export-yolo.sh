#!/usr/bin/env bash
# YOLO11n-pose（Ultralytics, AGPL-3.0）の公式の重みを ONNX に変換して public/models/ に置く。
# CI では .github/actions/yolo-model がキャッシュ付きで呼ぶ。手元で使うときは python3 が必要（1〜2 分、約 1GB をダウンロード）。
# モデルがなくてもアプリは MediaPipe だけで動く。
set -euo pipefail

PT_URL='https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n-pose.pt'
PT_SHA256='869e83fcdffdc7371fa4e34cd8e51c838cc729571d1635e5141e3075e9319dc0'
ULTRALYTICS_VERSION='8.4.180'

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/public/models/yolo11n-pose.onnx"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL -o "$tmp/yolo11n-pose.pt" "$PT_URL"
echo "$PT_SHA256  $tmp/yolo11n-pose.pt" | sha256sum -c -

python3 -m venv "$tmp/venv"
"$tmp/venv/bin/pip" install -q --index-url https://download.pytorch.org/whl/cpu torch torchvision
"$tmp/venv/bin/pip" install -q "ultralytics==$ULTRALYTICS_VERSION" onnx onnxslim onnxruntime

# 入力の大きさは推定のたびに変える（人の周りの切り抜き 320×320、画面全体 640×N）ので dynamic にする
(cd "$tmp" && YOLO_OFFLINE=1 "$tmp/venv/bin/yolo" export model=yolo11n-pose.pt format=onnx dynamic=True simplify=True)

# 出力の並び [1, 56, N]（外接枠 4 + 確からしさ 1 + 17 点 × 3）を src/analysis/hybrid.ts の decodeYolo が前提にしている
"$tmp/venv/bin/python" - "$tmp/yolo11n-pose.onnx" <<'PY'
import sys, numpy as np, onnxruntime as ort
s = ort.InferenceSession(sys.argv[1])
for h, w in ((320, 320), (640, 384)):
    y = s.run(None, {s.get_inputs()[0].name: np.zeros((1, 3, h, w), np.float32)})[0]
    assert y.shape[:2] == (1, 56), y.shape
print('[export-yolo] output', y.shape)
PY

mkdir -p "$(dirname "$out")"
cp "$tmp/yolo11n-pose.onnx" "$out"
echo "[export-yolo] wrote $out"
