import type { Metrics } from '../analysis/types'

export interface MetricDef {
  key: keyof Metrics
  label: string
  format: (v: number) => string
  /** 値が大きいほど良い (true) / 小さいほど良い (false) / どちらでもない (undefined) */
  higherIsBetter?: boolean
  hint: string
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const sec = (v: number) => `${v.toFixed(1)}秒`

export const METRICS: MetricDef[] = [
  { key: 'durationSec', label: '登攀時間', format: sec, hint: '動画の長さ' },
  { key: 'straightArmRatio', label: 'ストレートアーム', format: pct, higherIsBetter: true, hint: '静止中に腕が伸びていた割合' },
  { key: 'footHandRatio', label: '足/手の動き', format: (v) => `${v.toFixed(1)}倍`, higherIsBetter: true, hint: '足の移動回数 ÷ 手の移動回数' },
  { key: 'stillRatio', label: '静止時間', format: pct, higherIsBetter: false, hint: '登攀中に止まっていた時間の割合' },
  { key: 'moveCount', label: 'ムーブ数', format: (v) => `${v}回`, hint: '静止から次の静止までの動き' },
  { key: 'longestStillSec', label: '最長静止', format: sec, higherIsBetter: false, hint: '最も長く止まっていた時間' },
  { key: 'pathEfficiency', label: '重心の効率', format: pct, higherIsBetter: true, hint: '重心軌跡の直線性' },
  { key: 'lateralSway', label: '横ブレ', format: (v) => v.toFixed(2), higherIsBetter: false, hint: '重心と足の中点の水平ずれ（胴長比）' },
  { key: 'shakeRatio', label: 'シェイク', format: pct, hint: '片手を下ろしていた時間の割合' },
  { key: 'detectionRate', label: '検出率', format: pct, higherIsBetter: true, hint: '姿勢を検出できたフレームの割合' },
]

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
