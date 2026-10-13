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
}

const Ctx = createContext<DraftState | null>(null)

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<Draft | null>(null)
  const setDraft = (d: Draft | null) => {
    setDraftState((prev) => {
      if (prev && prev.url !== d?.url) URL.revokeObjectURL(prev.url)
      return d
    })
  }
  return <Ctx.Provider value={{ draft, setDraft }}>{children}</Ctx.Provider>
}

export function useDraft(): DraftState {
  const v = useContext(Ctx)
  if (!v) throw new Error('DraftProvider がありません')
  return v
}
