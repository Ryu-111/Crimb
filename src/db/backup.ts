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

/** 読み込むバックアップファイルの上限（動画は含まないのでこれで十分） */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

// NaN の指標は JSON で null になるので null も許す
const isMetrics = (m: unknown) => isObj(m) && Object.values(m).every((v) => v === null || isNum(v))

const isAdvice = (a: unknown) =>
  isObj(a) &&
  ['id', 'title', 'detail'].every((k) => typeof a[k] === 'string') &&
  ['high', 'medium', 'low', 'good'].includes(a.severity as string) &&
  (a.t === undefined || isNum(a.t))

/** 1 本の記録・1 本の動画として現実的な上限（これを超えるファイルは壊れているか悪意がある） */
export const MAX_SESSIONS = 5000
export const MAX_FRAMES = 100_000
export const MAX_ADVICE = 100
const LANDMARKS = 33

const isFrame = (f: unknown) =>
  isObj(f) &&
  isNum(f.t) &&
  f.t >= 0 &&
  (f.lm === null ||
    (Array.isArray(f.lm) && f.lm.length === LANDMARKS && f.lm.every((l) => isObj(l) && isNum(l.x) && isNum(l.y) && isNum(l.v))))

const isPosInt = (x: unknown): x is number => isNum(x) && Number.isInteger(x) && x > 0

/** 姿勢データ。再解析と 3D 表示が前提にしている形（fps・寸法・時刻の順序・カメラのずれの長さ）まで確認する */
function isTrack(t: unknown): boolean {
  if (!isObj(t) || !isNum(t.fps) || t.fps <= 0 || t.fps > 1000 || !isPosInt(t.width) || !isPosInt(t.height)) return false
  const frames = t.frames
  if (!Array.isArray(frames) || frames.length > MAX_FRAMES || !frames.every(isFrame)) return false
  for (let i = 1; i < frames.length; i++) if ((frames[i] as { t: number }).t < (frames[i - 1] as { t: number }).t) return false
  const cam = t.camera
  return cam === undefined || (Array.isArray(cam) && cam.length === frames.length && cam.every((c) => isObj(c) && isNum(c.dx) && isNum(c.dy)))
}

/** 外部ファイルなので形を確認してから読み込む */
export function isBackup(x: unknown): x is Backup {
  return (
    isObj(x) &&
    x.format === BACKUP_FORMAT &&
    x.version === 1 &&
    Array.isArray(x.sessions) &&
    x.sessions.length <= MAX_SESSIONS &&
    x.sessions.every(
      (e: unknown) =>
        isObj(e) &&
        isObj(e.session) &&
        isNum(e.session.createdAt) &&
        typeof e.session.problemName === 'string' &&
        isMetrics(e.session.metrics) &&
        Array.isArray(e.session.advice) &&
        e.session.advice.length <= MAX_ADVICE &&
        e.session.advice.every(isAdvice) &&
        (e.track === null || isTrack(e.track)),
    )
  )
}

/** 許可したフィールドだけで記録を組み立て直す（余計なキーや型違いを DB に入れない） */
export function toSessionRecord(s: BackupSession): Omit<SessionRecord, 'thumbnail'> {
  const str = (v: unknown) => (v == null ? '' : String(v))
  return {
    createdAt: s.createdAt,
    problemName: s.problemName,
    grade: str(s.grade),
    wallAngle: str(s.wallAngle),
    notes: str(s.notes),
    sent: !!s.sent,
    hasVideo: false,
    metrics: s.metrics,
    advice: s.advice.map(({ id, severity, title, detail, t }) => (t === undefined ? { id, severity, title, detail } : { id, severity, title, detail, t })),
  }
}

/** 許可したフィールドだけで姿勢データを組み立て直す */
export function toTrack(t: TrackRecord['track']): TrackRecord['track'] {
  const { fps, width, height, frames, camera } = t
  return {
    fps,
    width,
    height,
    frames: frames.map(({ t: time, lm }) => ({ t: time, lm: lm && lm.map(({ x, y, v }) => ({ x, y, v })) })),
    ...(camera ? { camera: camera.map(({ dx, dy }) => ({ dx, dy })) } : {}),
  }
}

/** 同じ記録（作成日時と課題名が一致）はスキップ。追加した件数を返す */
export async function importBackup(backup: Backup): Promise<number> {
  const existing = new Set((await db.sessions.toArray()).map((s) => `${s.createdAt}|${s.problemName}`))
  let added = 0
  for (const { session, track } of backup.sessions) {
    if (existing.has(`${session.createdAt}|${session.problemName}`)) continue
    const { thumbnail } = session
    const thumb =
      typeof thumbnail === 'string' && thumbnail.startsWith('data:image/') ? await (await fetch(thumbnail)).blob() : undefined
    await db.transaction('rw', db.sessions, db.tracks, async () => {
      const id = (await db.sessions.add({ ...toSessionRecord(session), thumbnail: thumb })) as number
      if (track) await db.tracks.put({ sessionId: id, track: toTrack(track) })
    })
    existing.add(`${session.createdAt}|${session.problemName}`)
    added++
  }
  return added
}

export async function deleteAll(): Promise<void> {
  await db.transaction('rw', db.sessions, db.tracks, db.videos, async () => {
    await Promise.all([db.sessions.clear(), db.tracks.clear(), db.videos.clear()])
  })
}
