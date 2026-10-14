import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm'
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

const local = (path: string) => new URL(path, document.baseURI).href

async function reachable(url: string): Promise<boolean> {
  try {
    // HEAD は Service Worker のプリキャッシュ（GET のみ）を通らずオフラインで失敗するため GET で確認し、本文は読まない
    const res = await fetch(url)
    void res.body?.cancel().catch(() => {})
    return res.ok
  } catch {
    return false
  }
}

let instance: Promise<PoseLandmarker> | null = null

/** PoseLandmarker を 1 度だけ初期化（同梱ファイル → CDN の順に試す、GPU → CPU の順に試す） */
export function getLandmarker(): Promise<PoseLandmarker> {
  instance ??= create().catch((e) => {
    instance = null
    throw e
  })
  return instance
}

async function create(): Promise<PoseLandmarker> {
  const localWasm = local('mediapipe/wasm')
  const wasm = (await reachable(`${localWasm}/vision_wasm_internal.wasm`)) ? localWasm : CDN_WASM
  const localModel = local('mediapipe/models/pose_landmarker_lite.task')
  const model = (await reachable(localModel)) ? localModel : CDN_MODEL
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
