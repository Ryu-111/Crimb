import { angle, LM, poseAt } from './geometry'
import type { Advice, LimbMove, Metrics, PoseTrack, Segment, Severity } from './types'

/** 改善案の判定しきい値。調整はここだけで行う。 */
export const THRESHOLDS = {
  minDetectionRate: 0.6,
  /** ストレートアームを判定するのに必要な肘角度のサンプル数（片腕 1 秒ぶん） */
  minElbowSamples: 15,
  stillRatioHigh: 0.65,
  longestStillSec: 8,
  straightArmLow: 0.35,
  straightArmGood: 0.6,
  footHandLow: 0.8,
  footHandGood: 1.3,
  pathEfficiencyLow: 0.35,
  lateralSwayHigh: 0.45,
  hipPositionLow: 0.7,
  shakeRatioHigh: 0.3,
} as const

export interface AdviceContext {
  stills: Segment[]
  limbMoves: LimbMove[]
  track: PoseTrack
  torso: number
  /** 記録の壁の角度（MetaFields の ANGLES）。未指定なら垂壁扱い */
  wallAngle?: string
  /** straightArmRatio の元になった肘角度のサンプル数。0 なら腕の判定をしない */
  elbowSamples: number
  /** 完登した記録。終了後に飛び降りるのは普通なので落下として扱わない */
  sent?: boolean
}

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, good: 3 }

export type WallKind = 'slab' | 'vertical' | 'steep'

export function wallKind(angle = ''): WallKind {
  if (angle === 'スラブ') return 'slab'
  if (['120°', '130°以上', 'ルーフ'].includes(angle)) return 'steep'
  return 'vertical'
}

/** 壁の角度で重要度を変える: スラブは足とバランスが主役、強傾斜は腕の伸びが主役で足の回数は減って当然 */
const EMPHASIS: Record<WallKind, Partial<Record<string, Severity>>> = {
  slab: { 'straight-arm': 'low', feet: 'high', balance: 'high' },
  vertical: {},
  steep: { 'straight-arm': 'high', feet: 'low' },
}

/** 腕が最も曲がっていた静止区間の開始時刻 */
function mostBentStill(ctx: AdviceContext): number | undefined {
  let worst: { t: number; deg: number } | undefined
  for (const s of ctx.stills) {
    const degs: number[] = []
    for (const f of ctx.track.frames) {
      if (f.t < s.start || f.t > s.end) continue
      const p = poseAt(f, ctx.track)
      if (!p) continue
      for (const [sh, el, wr] of [
        [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
        [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
      ] as const) {
        if (p.visible(sh, el, wr) && p.get(wr).y <= p.get(sh).y) degs.push(angle(p.get(sh), p.get(el), p.get(wr)))
      }
    }
    if (!degs.length) continue
    const avg = degs.reduce((a, b) => a + b, 0) / degs.length
    if (!worst || avg < worst.deg) worst = { t: s.start, deg: avg }
  }
  return worst?.t
}

function longestStill(stills: Segment[]): number | undefined {
  let best: Segment | undefined
  for (const s of stills) if (!best || s.end - s.start > best.end - best.start) best = s
  return best?.start
}

const pct = (v: number) => `${Math.round(v * 100)}%`

export function buildAdvice(m: Metrics, ctx: AdviceContext): Advice[] {
  const T = THRESHOLDS
  const out: Advice[] = []

  if (m.detectionRate < T.minDetectionRate) {
    out.push({
      id: 'capture',
      severity: 'high',
      title: '撮影条件を見直しましょう',
      detail: `姿勢を検出できたのは ${pct(m.detectionRate)} のフレームだけでした。スマホを固定し、壁から離れて全身（手足の先まで）が常に画面に入るように撮ると精度が上がります。`,
    })
    // 検出が足りないと、静止・移動・腕の角度のどれも信頼できない。間違った助言を出すより、撮り直しだけを勧める
    return out
  }

  if (m.fallAt !== null && !ctx.sent) {
    out.push({
      id: 'fall',
      severity: 'high',
      title: `${m.fallAt.toFixed(1)} 秒付近で落下`,
      detail: '落ちる直前の姿勢を確認しましょう。足が抜けていないか、腰が壁から離れていないか、次のホールドが遠すぎないか（足を上げてから出す）をチェック。',
      t: m.fallAt,
    })
  }

  if (ctx.elbowSamples < T.minElbowSamples) {
    // 静止中に腕がほとんど測れなかった（静止なし・背面撮影で腕が隠れていた等）ので判定しない
  } else if (m.straightArmRatio < T.straightArmLow) {
    out.push({
      id: 'straight-arm',
      severity: 'high',
      title: '腕が曲がったまま保持している時間が長い',
      detail: `静止中に腕が伸びていたのは ${pct(m.straightArmRatio)}。腕は伸ばして骨でぶら下がり、脚で押して登ると前腕のパンプを防げます。`,
      t: mostBentStill(ctx),
    })
  } else if (m.straightArmRatio >= T.straightArmGood) {
    out.push({
      id: 'straight-arm-good',
      severity: 'good',
      title: 'ストレートアームができています',
      detail: `静止中の ${pct(m.straightArmRatio)} で腕が伸びていました。この省エネ姿勢をキープしましょう。`,
    })
  }

  if (m.handMoves >= 3 && m.footHandRatio < T.footHandLow) {
    out.push({
      id: 'feet',
      severity: 'medium',
      title: '足の動きが少なめ',
      detail: `足の移動 ${m.footMoves} 回に対し手の移動 ${m.handMoves} 回。手を出す前に足を上げる・細かく置き直すことで、遠いホールドにも楽に届きます。`,
    })
  } else if (m.footHandRatio >= T.footHandGood) {
    out.push({
      id: 'feet-good',
      severity: 'good',
      title: 'こまめに足を使えています',
      detail: `足の移動が手の ${m.footHandRatio.toFixed(1)} 倍。足主導の良い登りです。`,
    })
  }

  if (m.stillRatio > T.stillRatioHigh || m.longestStillSec > T.longestStillSec) {
    out.push({
      id: 'hesitation',
      severity: 'medium',
      title: '止まっている時間が長い',
      detail: `登っている時間の ${pct(m.stillRatio)} が静止、最長 ${m.longestStillSec.toFixed(1)} 秒。登る前のオブザベでムーブを決めておく、レストは腕を伸ばせる場所で取るのがコツです。`,
      t: longestStill(ctx.stills),
    })
  }

  if (m.pathEfficiency > 0 && m.pathEfficiency < T.pathEfficiencyLow) {
    out.push({
      id: 'path',
      severity: 'low',
      title: '重心の動きに無駄が多い',
      detail: '重心が行ったり来たりしています。次のムーブの体勢を先に作ってから一度で動く意識を持ちましょう。',
    })
  }

  if (m.lateralSway > T.lateralSwayHigh) {
    out.push({
      id: 'balance',
      severity: 'medium',
      title: '重心が足の真上から外れがち',
      detail: '静止中、重心が支持足から横にずれています。体重を乗せたい足の真上に腰を移す（足に乗り込む）と手の負担が減ります。',
    })
  }

  if (m.hipPosition > 0 && m.hipPosition > T.hipPositionLow) {
    out.push({
      id: 'hips',
      severity: 'low',
      title: '腰が低い位置にある',
      detail: '腰が足に近く、ぶら下がり気味です。足を上げたら膝を伸ばして腰を持ち上げ、次のホールドに近づきましょう。',
    })
  }

  if (m.shakeRatio > T.shakeRatioHigh) {
    out.push({
      id: 'shake',
      severity: 'low',
      title: 'シェイク・チョークの時間が多い',
      detail: `片手を下ろしている時間が ${pct(m.shakeRatio)}。疲れる前にテンポ良く進むか、レスト位置を決めておきましょう。`,
    })
  }

  const emphasis = EMPHASIS[wallKind(ctx.wallAngle)]
  return out
    .map((a) => ({ ...a, severity: emphasis[a.id] ?? a.severity }))
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
}
