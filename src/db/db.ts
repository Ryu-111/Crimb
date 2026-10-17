import Dexie, { type EntityTable } from 'dexie'
import type { Hold, Hsv } from '../analysis/route'
import type { Advice, Metrics, PoseTrack } from '../analysis/types'

export interface SessionMeta {
  problemName: string
  /** 例: "V4", "4級" */
  grade: string
  /** 例: "垂壁", "100°", "130°" */
  wallAngle: string
  sent: boolean
  notes: string
}

export interface SessionRecord extends SessionMeta {
  id?: number
  createdAt: number
  metrics: Metrics
  advice: Advice[]
  thumbnail?: Blob
  hasVideo: boolean
  /** 課題のホールド（3D 表示でタップした色と、最初のコマから拾った位置）。インデックスは不要なのでスキーマ変更なし */
  route?: SavedRoute
}

export interface SavedRoute {
  color: Hsv
  holds: Hold[]
}

/** 姿勢時系列は一覧表示で読み込まないよう別テーブル */
export interface TrackRecord {
  sessionId: number
  track: PoseTrack
}

export interface VideoRecord {
  sessionId: number
  blob: Blob
}

// PR プレビューは本番と同じ github.io オリジンなので、別名の DB を使って本番データに触れない
export const db = new Dexie(import.meta.env.VITE_DB_NAME || 'crimb') as Dexie & {
  sessions: EntityTable<SessionRecord, 'id'>
  tracks: EntityTable<TrackRecord, 'sessionId'>
  videos: EntityTable<VideoRecord, 'sessionId'>
}

db.version(1).stores({
  sessions: '++id, createdAt, problemName, grade, sent',
  tracks: 'sessionId',
  videos: 'sessionId',
})

export async function saveSession(
  session: Omit<SessionRecord, 'id'>,
  track: PoseTrack,
  video?: Blob,
): Promise<number> {
  return db.transaction('rw', db.sessions, db.tracks, db.videos, async () => {
    const id = (await db.sessions.add({ ...session, hasVideo: !!video })) as number
    await db.tracks.put({ sessionId: id, track })
    if (video) await db.videos.put({ sessionId: id, blob: video })
    return id
  })
}

export async function deleteSession(id: number): Promise<void> {
  await db.transaction('rw', db.sessions, db.tracks, db.videos, async () => {
    await db.sessions.delete(id)
    await db.tracks.delete(id)
    await db.videos.delete(id)
  })
}

/** 同じ課題の直前のセッション（前回比の表示用） */
export async function previousSession(problemName: string, before: number): Promise<SessionRecord | undefined> {
  const list = await db.sessions.where('problemName').equals(problemName).toArray()
  return list.filter((s) => s.createdAt < before).sort((a, b) => b.createdAt - a.createdAt)[0]
}
