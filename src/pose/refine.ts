// 結果を見せた後に続ける、精度を上げる解析（YOLO での補いと検出し直し）。同時に動くのは 1 つだけ
import { useSyncExternalStore } from 'react'
import type { PoseTrack } from '../analysis/types'
import { refinePoseTrack } from './extractFrames'
import { loadVideo } from './video'

export interface RefineState {
  /** 解析している動画（下書きの Object URL） */
  url: string
  /** 0〜1 */
  progress: number
  status: 'running' | 'done' | 'failed'
  /** 途中で保存した記録の id。終わったらその記録の姿勢も置き換える */
  sessionId?: number
}

let state: RefineState | null = null
let ctrl: AbortController | null = null
const listeners = new Set<() => void>()

function set(next: RefineState | null) {
  state = next
  listeners.forEach((l) => l())
}

/**
 * 動画 url の速い解析の結果 raw から、精度を上げる解析を始める。前の解析は止める。
 * 終わったら onDone に新しい姿勢と、途中で保存した記録の id（保存していなければ undefined）を渡す。失敗したら onFail を呼ぶ
 */
export function startRefine(
  url: string,
  raw: PoseTrack,
  onDone: (track: PoseTrack, sessionId?: number) => void,
  onFail?: () => void,
): void {
  ctrl?.abort()
  const mine = new AbortController()
  ctrl = mine
  set({ url, progress: 0, status: 'running' })
  const update = (patch: Partial<RefineState>) => {
    if (ctrl === mine && state) set({ ...state, ...patch })
  }
  ;(async () => {
    try {
      // 結果画面の動画とシーク位置を取り合わないよう、別に読み込む
      const video = await loadVideo(url)
      const track = await refinePoseTrack(video, raw, {
        signal: mine.signal,
        onProgress: (p) => {
          // 1% 刻みでだけ知らせる（結果画面を毎コマ描き直さないように）
          if (Math.floor(p * 100) !== Math.floor((state?.progress ?? 0) * 100)) update({ progress: p })
        },
      })
      if (ctrl !== mine) return
      onDone(track, state?.sessionId)
      update({ status: 'done', progress: 1 })
    } catch (e) {
      if ((e as Error).name === 'AbortError' || ctrl !== mine) return
      update({ status: 'failed' })
      onFail?.()
    }
  })()
}

/** 精度を上げる解析を止める（新しい解析を始める前に。姿勢推定のモデルを取り合わないように） */
export function cancelRefine(): void {
  ctrl?.abort()
  ctrl = null
  set(null)
}

/** 動画 url の解析中に保存した記録の id を覚える */
export function attachSession(url: string, sessionId: number): void {
  if (state?.url === url) set({ ...state, sessionId })
}

/** 今の精度を上げる解析の状態（なければ null） */
export function useRefine(): RefineState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
