/**
 * 2 つの姿勢推定（MediaPipe と YOLO-pose）の結果を合わせる。
 * MediaPipe は顔を手がかりに人を探すので、後ろ向き・暗い服・画面に小さく写る人を見失ったり、壁のホールドの塊を人と取り違えたりする。
 * YOLO-pose は全身の見た目で人を探すのでこうした動画に強いが、手の指先・つま先がなく、強い傾斜の体勢では見失いやすい。
 * 両方が同じ人を指しているときは細かい点まである MediaPipe を使い、食い違うか MediaPipe がないときは YOLO を使う
 */
import type { Landmark } from './types'

/** COCO の 17 点（YOLO-pose の出力順）→ MediaPipe の 33 点の番号 */
const COCO_TO_MP: Record<number, number> = {
  0: 0, // 鼻
  2: 1, // 左目（MediaPipe は左目の内・中・外の 3 点。すべて目の位置にする）
  1: 1,
  3: 1,
  5: 2, // 右目
  4: 2,
  6: 2,
  7: 3, // 左耳
  8: 4, // 右耳
  11: 5, // 肩
  12: 6,
  13: 7, // 肘
  14: 8,
  15: 9, // 手首
  16: 10,
  // 手の指（小指・人差し指・親指）は手首で代用する
  17: 9,
  18: 10,
  19: 9,
  20: 10,
  21: 9,
  22: 10,
  23: 11, // 腰
  24: 12,
  25: 13, // 膝
  26: 14,
  27: 15, // 足首
  28: 16,
  // かかと・つま先は足首で代用する
  29: 15,
  30: 16,
  31: 15,
  32: 16,
}

/** YOLO-pose の 17 点を MediaPipe の 33 点の並びにする（口の 2 点は鼻で代用し、見えない扱いにする） */
export function cocoToMediapipe(kp: Landmark[]): Landmark[] {
  return Array.from({ length: 33 }, (_, i) => {
    const src = COCO_TO_MP[i]
    if (src === undefined) return { x: kp[0]!.x, y: kp[0]!.y, v: 0 }
    return { ...kp[src]! }
  })
}

/** 2 つの推定が同じ人とみなす腰の中心のずれ（正規化画像座標の横・縦） */
export const SAME_PERSON_DX = 0.08
export const SAME_PERSON_DY = 0.06

const hipOf = (lm: Landmark[]) => ({ x: (lm[23]!.x + lm[24]!.x) / 2, y: (lm[23]!.y + lm[24]!.y) / 2 })

/** 2 つの姿勢が同じ人を指しているか（腰の位置が近い） */
export function samePerson(a: Landmark[], b: Landmark[]): boolean {
  const p = hipOf(a)
  const q = hipOf(b)
  return Math.abs(p.x - q.x) < SAME_PERSON_DX && Math.abs(p.y - q.y) < SAME_PERSON_DY
}

/** 1 コマ分の合成。yolo は cocoToMediapipe で 33 点にしたもの */
export function mergePose(mediapipe: Landmark[] | null, yolo: Landmark[] | null): Landmark[] | null {
  if (!yolo) return mediapipe
  if (!mediapipe) return yolo
  return samePerson(mediapipe, yolo) ? mediapipe : yolo
}

/** この確からしさ未満の人は捨てる */
export const YOLO_MIN_SCORE = 0.25

export interface YoloPerson {
  score: number
  /** 外接枠の中心と幅・高さ（入力画像のピクセル） */
  box: { cx: number; cy: number; w: number; h: number }
  /** COCO の 17 点（入力画像のピクセル、v は確からしさ） */
  kp: Landmark[]
}

/** YOLO-pose の出力 [1, 56, N]（4 = 外接枠、1 = 確からしさ、51 = 17 点 × (x, y, v)）を人の候補にする */
export function decodeYolo(out: Float32Array, n: number, minScore = YOLO_MIN_SCORE): YoloPerson[] {
  const at = (row: number, i: number) => out[row * n + i]!
  const people: YoloPerson[] = []
  for (let i = 0; i < n; i++) {
    const score = at(4, i)
    if (score < minScore) continue
    const kp: Landmark[] = []
    for (let k = 0; k < 17; k++) kp.push({ x: at(5 + 3 * k, i), y: at(6 + 3 * k, i), v: at(7 + 3 * k, i) })
    people.push({ score, box: { cx: at(0, i), cy: at(1, i), w: at(2, i), h: at(3, i) }, kp })
  }
  return people
}
