/** 正規化画像座標 (0..1) のランドマーク。v は visibility (0..1)。 */
export interface Landmark {
  x: number
  y: number
  v: number
}

/** 1 フレーム分の姿勢。検出できなかったフレームは lm = null。 */
export interface Frame {
  /** 動画先頭からの秒数 */
  t: number
  lm: Landmark[] | null
}

/** 動画 1 本分の姿勢時系列 */
export interface PoseTrack {
  fps: number
  width: number
  height: number
  frames: Frame[]
}

export interface Segment {
  start: number
  end: number
}

export type Limb = 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot'

export interface LimbMove extends Segment {
  limb: Limb
}

export interface Metrics {
  durationSec: number
  /** 姿勢が検出できたフレームの割合 */
  detectionRate: number
  /** 静止していた時間の割合 */
  stillRatio: number
  moveCount: number
  avgMoveSec: number
  longestStillSec: number
  /** 静止中に腕が伸びていた割合 (0..1) */
  straightArmRatio: number
  handMoves: number
  footMoves: number
  /** 足の動き / 手の動き */
  footHandRatio: number
  /** 重心軌跡の効率 = 始点終点の直線距離 / 経路長 (0..1, 高いほど無駄が少ない) */
  pathEfficiency: number
  /** 静止中の重心と両足中点の水平ずれ (胴長比) */
  lateralSway: number
  /** 静止中の腰の位置: 0 = 手の高さ, 1 = 足の高さ */
  hipPosition: number
  /** 片手を下ろしていた (シェイク/チョーク) 時間の割合 */
  shakeRatio: number
  /** 登った高さ (胴長換算) */
  verticalGain: number
  /** 落下を検出した時刻 (秒)。なければ null */
  fallAt: number | null
}

export type Severity = 'high' | 'medium' | 'low' | 'good'

export interface Advice {
  id: string
  severity: Severity
  title: string
  detail: string
  /** 該当箇所の時刻 (秒) */
  t?: number
}

export interface Analysis {
  metrics: Metrics
  advice: Advice[]
  stills: Segment[]
  moves: Segment[]
  limbMoves: LimbMove[]
}
