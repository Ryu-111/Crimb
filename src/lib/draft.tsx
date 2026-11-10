import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Analysis, PoseTrack } from '../analysis/types'
import type { SessionMeta } from '../db/db'

/** 撮影〜解析〜保存までの未保存データ */
export interface Draft {
  file: File
  url: string
  meta: SessionMeta
  track?: PoseTrack
  analysis?: Analysis
  thumbnail?: Blob
  /** 解析が終わった時刻 */
  createdAt?: number
}

interface DraftState {
  draft: Draft | null
  setDraft: (d: Draft | null) => void
  /** 今の下書きを元に書き換える（画面を離れた後に終わる処理から使う） */
  updateDraft: (f: (d: Draft | null) => Draft | null) => void
}

const Ctx = createContext<DraftState | null>(null)

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<Draft | null>(null)
  const updateDraft = (f: (d: Draft | null) => Draft | null) => {
    setDraftState((prev) => {
      const d = f(prev)
      if (prev && prev.url !== d?.url) URL.revokeObjectURL(prev.url)
      return d
    })
  }
  const setDraft = (d: Draft | null) => updateDraft(() => d)
  return <Ctx.Provider value={{ draft, setDraft, updateDraft }}>{children}</Ctx.Provider>
}

export function useDraft(): DraftState {
  const v = useContext(Ctx)
  if (!v) throw new Error('DraftProvider がありません')
  return v
}
