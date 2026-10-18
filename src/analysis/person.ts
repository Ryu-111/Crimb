/**
 * 画面に何人も写るとき、どの人を登っている人として追うかを決める。
 * 手前で座っている人・ビレイヤーは大きく写るので確からしさが高いが、体が画面の縁で切れている。
 * 登っている人は壁の上にいて、全身が画面に収まる（撮影時にそう案内している）
 */
import type { YoloPerson } from './hybrid'

/** 外接枠の端が画面の縁からこの割合以内なら、縁で切れているとみなす */
export const EDGE_MARGIN = 0.02
/** 縁で切れている人の確からしさに掛ける値 */
export const CUT_OFF_PENALTY = 0.3

/** 下・左・右の縁で体が切れているか（上は、壁の上の方に手を伸ばした人も切れるので見ない） */
export function cutOff(p: YoloPerson, width: number, height: number): boolean {
  const { cx, cy, w, h } = p.box
  return cy + h / 2 >= height * (1 - EDGE_MARGIN) || cx - w / 2 <= width * EDGE_MARGIN || cx + w / 2 >= width * (1 - EDGE_MARGIN)
}

/** 追っている人がいないときに選ぶ人。縁で切れている人は確からしさを下げて比べる */
export function pickPerson(people: YoloPerson[], width: number, height: number): YoloPerson | null {
  const rank = (p: YoloPerson) => p.score * (cutOff(p, width, height) ? CUT_OFF_PENALTY : 1)
  return people.reduce<YoloPerson | null>((a, b) => (!a || rank(b) > rank(a) ? b : a), null)
}
