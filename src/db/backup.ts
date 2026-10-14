import { db, type SessionRecord, type TrackRecord } from './db'

export const BACKUP_FORMAT = 'crimb-backup'

interface BackupSession extends Omit<SessionRecord, 'thumbnail'> {
  /** data URL (JPEG) */
  thumbnail?: string
}

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: 1
  exportedAt: number
  sessions: { session: BackupSession; track: TrackRecord['track'] | null }[]
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })

/** 記録と姿勢データを JSON にまとめる（動画は容量が大きいので含めない） */
export async function exportBackup(): Promise<Backup> {
  const sessions = await db.sessions.toArray()
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: Date.now(),
    sessions: await Promise.all(
      sessions.map(async ({ thumbnail, ...s }) => ({
        session: { ...s, hasVideo: false, thumbnail: thumbnail && (await blobToDataUrl(thumbnail)) },
        track: (await db.tracks.get(s.id!))?.track ?? null,
      })),
    ),
  }
}

/** 外部ファイルなので形を確認してから読み込む */
export function isBackup(x: unknown): x is Backup {
  const b = x as Backup
  return (
    !!b &&
    b.format === BACKUP_FORMAT &&
    b.version === 1 &&
    Array.isArray(b.sessions) &&
    b.sessions.every(
      (e) =>
        e &&
        typeof e.session?.createdAt === 'number' &&
        typeof e.session.problemName === 'string' &&
        typeof e.session.metrics === 'object' &&
        Array.isArray(e.session.advice) &&
        (e.track === null || Array.isArray(e.track?.frames)),
    )
  )
}

/** 同じ記録（作成日時と課題名が一致）はスキップ。追加した件数を返す */
export async function importBackup(backup: Backup): Promise<number> {
  const existing = new Set((await db.sessions.toArray()).map((s) => `${s.createdAt}|${s.problemName}`))
  let added = 0
  for (const { session, track } of backup.sessions) {
    if (existing.has(`${session.createdAt}|${session.problemName}`)) continue
    const { id: _id, thumbnail, ...rest } = session
    const thumb = thumbnail?.startsWith('data:image/') ? await (await fetch(thumbnail)).blob() : undefined
    await db.transaction('rw', db.sessions, db.tracks, async () => {
      const id = (await db.sessions.add({ ...rest, thumbnail: thumb })) as number
      if (track) await db.tracks.put({ sessionId: id, track })
    })
    added++
  }
  return added
}

export async function deleteAll(): Promise<void> {
  await db.transaction('rw', db.sessions, db.tracks, db.videos, async () => {
    await Promise.all([db.sessions.clear(), db.tracks.clear(), db.videos.clear()])
  })
}
