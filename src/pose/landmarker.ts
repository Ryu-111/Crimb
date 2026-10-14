import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm'
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

const local = (path: string) => new URL(path, document.baseURI).href

let instance: Promise<PoseLandmarker> | null = null

/** PoseLandmarker を 1 度だけ初期化（同梱ファイル → CDN の順に試す、GPU → CPU の順に試す） */
export function getLandmarker(): Promise<PoseLandmarker> {
  instance ??= create().catch((e) => {
    instance = null
    throw e
  })
  return instance
}

// 同梱ファイルを直接読み込んで試す（オフラインでも SW のプリキャッシュが GET に応える）。失敗したら CDN
async function create(): Promise<PoseLandmarker> {
  try {
    return await createFrom(local('mediapipe/wasm'), local('mediapipe/models/pose_landmarker_lite.task'))
  } catch {
    return createFrom(CDN_WASM, CDN_MODEL)
  }
}

async function createFrom(wasm: string, model: string): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(wasm)
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: model, delegate },
    runningMode: 'VIDEO' as const,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
  try {
    return await PoseLandmarker.createFromOptions(fileset, options('GPU'))
  } catch {
    return PoseLandmarker.createFromOptions(fileset, options('CPU'))
  }
}
