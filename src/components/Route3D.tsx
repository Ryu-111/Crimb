import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Contact, Hold, Hsv } from '../analysis/route'
import { LM, segmentCom } from '../analysis/geometry'
import type { PoseTrack } from '../analysis/types'

export interface Route3DProps {
  /** 壁の写真（動画の 1 コマ） */
  image: HTMLCanvasElement
  holds: Hold[]
  contacts: Contact[]
  order: number[]
  track: PoseTrack
  /** 垂直に対する壁の傾き（度。手前に被るほど正） */
  tilt: number
  /** タップした課題の色。ホールドをこの色相で塗る */
  color: Hsv
  /** 重ねて表示する同じ課題の別のトライ */
  ghost?: Ghost
}

export interface Ghost {
  track: PoseTrack
  /** 別のトライの正規化座標 → この写真の正規化座標 */
  map: (x: number, y: number) => { x: number; y: number }
  /** この記録の時刻に足すと、別のトライの同じ場面の時刻になる（登り始めをそろえる） */
  offset: number
}

const HOLD_IDLE = '#94a3b8'
const FOOT = '#38bdf8'
const INK = '#0f172a'
const COM = '#facc15'
const GHOST = '#10b981'
/** 手足の軌跡の色（左手・右手・左足・右足） */
export const FLOW: [string, number, string][] = [
  ['左手', LM.leftWrist, '#f472b6'],
  ['右手', LM.rightWrist, '#fb923c'],
  ['左足', LM.leftAnkle, '#38bdf8'],
  ['右足', LM.rightAnkle, '#a78bfa'],
]
const BONES: [number, number][] = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
]

function numberSprite(text: string, ring: string): THREE.Sprite {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(48, 48, 40, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 8
  g.strokeStyle = ring
  g.stroke()
  g.fillStyle = INK
  g.font = 'bold 48px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 48, 52)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }))
  s.scale.set(0.07, 0.07, 1)
  s.renderOrder = 10
  return s
}

/**
 * 課題のホールドを壁の写真の上に立体で置き、触れた順の番号・手足の経路・骨格を重ねる。
 * ホールドの位置は写真上の 2 次元の位置で、奥行きは大きさから付けた見た目上のもの（ハリボテの凹凸は出ない）
 */
export default function Route3D({ image, holds, contacts, order, track, tilt, color, ghost }: Route3DProps) {
  const host = useRef<HTMLDivElement>(null)
  const setTime = useRef<(t: number) => void>(() => {})
  const layers = useRef<{ com?: THREE.Object3D; flow?: THREE.Object3D; draw?: () => void }>({})
  const [showCom, setShowCom] = useState(true)
  const [showFlow, setShowFlow] = useState(false)
  const duration = track.frames.length ? track.frames[track.frames.length - 1]!.t : 0
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const el = host.current
    if (!el) return
    // 写真の色のままだと暗いことがあるので、色相だけ使って見やすい明るさにそろえる
    const HOLD = `#${new THREE.Color().setHSL(color.h / 360, 0.85, 0.6).getHexString()}`
    const W = 1
    const H = image.height / image.width
    const at = (x: number, y: number, z = 0) => new THREE.Vector3((x - 0.5) * W, (0.5 - y) * H, z)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    el.appendChild(renderer.domElement)
    renderer.domElement.className = 'block h-full w-full touch-none'
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0f172a')
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(-1.5, 2, 3)
    scene.add(sun)

    // 壁は下端を軸に傾ける（手前に被る壁は上が手前に来る）
    const pivot = new THREE.Group()
    pivot.position.y = -H / 2
    pivot.rotation.x = (tilt * Math.PI) / 180
    scene.add(pivot)
    const wallGroup = new THREE.Group()
    wallGroup.position.y = H / 2
    pivot.add(wallGroup)
    const wallTex = new THREE.CanvasTexture(image)
    wallTex.colorSpace = THREE.SRGBColorSpace
    wallGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 })))

    const used = new Set(order)
    const holdMats = holds.map((h, i) => {
      const geo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)
      geo.rotateX(Math.PI / 2)
      const mat = new THREE.MeshStandardMaterial({ color: used.has(i) ? HOLD : HOLD_IDLE, roughness: 0.5 })
      const mesh = new THREE.Mesh(geo, mat)
      const depth = Math.max(0.012, Math.sqrt(h.area) * 0.45)
      mesh.scale.set((h.w * W) / 2, (h.h * H) / 2, depth)
      mesh.position.copy(at(h.x, h.y, 0.001))
      wallGroup.add(mesh)
      return mat
    })
    order.forEach((hi, k) => {
      const h = holds[hi]!
      const s = numberSprite(String(k + 1), HOLD)
      s.position.copy(at(h.x + h.w / 2 + 0.03, h.y - h.h / 2, 0.06))
      wallGroup.add(s)
    })
    const path = (feet: boolean, color: string) => {
      const pts = contacts.filter((c) => c.limb.endsWith('足') === feet).map((c) => at(holds[c.hold]!.x, holds[c.hold]!.y, 0.03))
      if (pts.length < 2) return
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineDashedMaterial({ color, dashSize: 0.025, gapSize: 0.015, depthTest: false }),
      )
      line.computeLineDistances()
      line.renderOrder = 5
      wallGroup.add(line)
    }
    path(false, HOLD)
    path(true, FOOT)

    const skelGeo = new THREE.BufferGeometry()
    skelGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BONES.length * 6), 3))
    const skel = new THREE.LineSegments(skelGeo, new THREE.LineBasicMaterial({ color: INK, depthTest: false }))
    skel.renderOrder = 6
    wallGroup.add(skel)

    const line = (pts: THREE.Vector3[], color: string, opacity = 1) => {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false }),
      )
      l.renderOrder = 4
      return l
    }
    const marker = (color: string) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false }))
      m.renderOrder = 7
      return m
    }
    const comOf = (lm: NonNullable<PoseTrack['frames'][number]['lm']> | null) => (lm ? segmentCom(lm) : null)

    // 重心の軌跡（部位ごとの質量比で推定）
    const comGroup = new THREE.Group()
    const comPts = track.frames.map((f) => comOf(f.lm)).filter((c) => c !== null)
    comGroup.add(line(comPts.map((c) => at(c.x, c.y, 0.07)), COM, 0.9))
    const comMarker = marker(COM)
    comGroup.add(comMarker)
    wallGroup.add(comGroup)

    // 手足の軌跡
    const flowGroup = new THREE.Group()
    for (const [, idx, c] of FLOW) {
      const pts = track.frames.flatMap((f) => (f.lm && f.lm[idx]!.v >= 0.3 ? [at(f.lm[idx]!.x, f.lm[idx]!.y, 0.05)] : []))
      if (pts.length > 1) flowGroup.add(line(pts, c, 0.75))
    }
    wallGroup.add(flowGroup)
    layers.current = { com: comGroup, flow: flowGroup }

    // 同じ課題の別のトライ（骨格と重心）
    const ghostGeo = new THREE.BufferGeometry()
    ghostGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BONES.length * 6), 3))
    const ghostSkel = new THREE.LineSegments(ghostGeo, new THREE.LineBasicMaterial({ color: GHOST, depthTest: false, transparent: true, opacity: 0.85 }))
    ghostSkel.renderOrder = 6
    const ghostCom = marker(GHOST)
    if (ghost) {
      const g = (x: number, y: number, z: number) => {
        const p = ghost.map(x, y)
        return at(p.x, p.y, z)
      }
      const pts = ghost.track.frames.map((f) => comOf(f.lm)).filter((c) => c !== null)
      comGroup.add(line(pts.map((c) => g(c.x, c.y, 0.07)), GHOST, 0.8))
      comGroup.add(ghostCom)
      wallGroup.add(ghostSkel)
    }
    const ghostAt = (time: number) => {
      if (!ghost) return
      const f = ghost.track.frames[Math.round((time + ghost.offset) * ghost.track.fps)]
      ghostSkel.visible = !!f?.lm
      ghostCom.visible = !!f?.lm
      if (!f?.lm) return
      const pos = ghostGeo.attributes.position!.array as Float32Array
      const map = (i: number, z: number) => {
        const p = ghost.map(f.lm![i]!.x, f.lm![i]!.y)
        return at(p.x, p.y, z)
      }
      BONES.forEach(([a, b], k) => {
        const p = map(a, 0.08)
        const q = map(b, 0.08)
        pos.set([p.x, p.y, p.z, q.x, q.y, q.z], k * 6)
      })
      ghostGeo.attributes.position!.needsUpdate = true
      const c = comOf(f.lm)
      if (c) {
        const p = ghost.map(c.x, c.y)
        ghostCom.position.copy(at(p.x, p.y, 0.075))
      }
    }

    // ドラッグで回転、ホイール・ピンチで拡大
    const view = { yaw: -0.35, pitch: 0.12, dist: 2.2 + H * 0.5 }
    const place = () => {
      const cy = Math.cos(view.pitch)
      camera.position.set(Math.sin(view.yaw) * cy * view.dist, Math.sin(view.pitch) * view.dist, Math.cos(view.yaw) * cy * view.dist)
      camera.lookAt(0, 0, 0)
    }
    const draw = () => renderer.render(scene, camera)
    const pointers = new Map<number, PointerEvent>()
    let pinch0 = 0
    let dist0 = 0
    const canvas = renderer.domElement
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, e)
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [PointerEvent, PointerEvent]
        pinch0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
        dist0 = view.dist
      }
    }
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      pointers.set(e.pointerId, e)
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [PointerEvent, PointerEvent]
        view.dist = Math.min(6, Math.max(1, (dist0 * pinch0) / Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY))))
      } else {
        view.yaw = Math.max(-1.3, Math.min(1.3, view.yaw - (e.clientX - prev.clientX) * 0.008))
        view.pitch = Math.max(-0.6, Math.min(0.9, view.pitch + (e.clientY - prev.clientY) * 0.006))
      }
      place()
      draw()
    }
    const up = (e: PointerEvent) => pointers.delete(e.pointerId)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      view.dist = Math.min(6, Math.max(1, view.dist * (1 + e.deltaY * 0.001)))
      place()
      draw()
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('wheel', wheel, { passive: false })

    const resize = () => {
      const r = el.getBoundingClientRect()
      renderer.setSize(r.width, r.height, false)
      camera.aspect = r.width / Math.max(1, r.height)
      camera.updateProjectionMatrix()
      draw()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    setTime.current = (time: number) => {
      const f = track.frames[Math.min(track.frames.length - 1, Math.max(0, Math.round(time * track.fps)))]
      const pos = skelGeo.attributes.position!.array as Float32Array
      skel.visible = !!f?.lm
      if (f?.lm) {
        BONES.forEach(([a, b], k) => {
          const p = at(f.lm![a]!.x, f.lm![a]!.y, 0.08)
          const q = at(f.lm![b]!.x, f.lm![b]!.y, 0.08)
          pos.set([p.x, p.y, p.z, q.x, q.y, q.z], k * 6)
        })
        skelGeo.attributes.position!.needsUpdate = true
      }
      const c = comOf(f?.lm ?? null)
      comMarker.visible = !!c
      if (c) comMarker.position.copy(at(c.x, c.y, 0.075))
      ghostAt(time)
      const touching = new Map(contacts.filter((c) => time >= c.t && time < c.t + c.dur).map((c) => [c.hold, c.limb.endsWith('足')]))
      holdMats.forEach((m, i) => {
        const foot = touching.get(i)
        m.color.set(foot === true ? FOOT : used.has(i) ? HOLD : HOLD_IDLE)
        m.emissive.set(foot === undefined ? '#000000' : foot ? FOOT : HOLD)
        m.emissiveIntensity = foot === undefined ? 0 : 0.5
      })
      draw()
    }
    layers.current.draw = draw
    place()
    resize()
    setTime.current(0)

    return () => {
      ro.disconnect()
      renderer.dispose()
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Sprite) {
          o.geometry.dispose()
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m: THREE.Material & { map?: THREE.Texture | null }) => {
            m.map?.dispose()
            m.dispose()
          })
        }
      })
      el.removeChild(canvas)
    }
  }, [image, holds, contacts, order, track, tilt, color, ghost])

  useEffect(() => setTime.current(t), [t, ghost])

  useEffect(() => {
    const l = layers.current
    if (l.com) l.com.visible = showCom
    if (l.flow) l.flow.visible = showFlow
    l.draw?.()
  }, [showCom, showFlow, image, holds, contacts, order, track, tilt, color, ghost])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      setT((v) => {
        const next = v + (now - last) / 1000
        if (next >= duration) {
          setPlaying(false)
          return duration
        }
        return next
      })
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, duration])

  return (
    <div className="space-y-2">
      <div ref={host} className="aspect-[4/5] w-full overflow-hidden rounded-xl bg-slate-900" aria-label="課題の 3D 表示。ドラッグで回転、ピンチで拡大" role="img" />
      <div className="flex items-center gap-2">
        <button
          className="min-h-11 rounded-lg bg-slate-800 px-4 text-sm"
          onClick={() => {
            if (t >= duration) setT(0)
            setPlaying((p) => !p)
          }}
        >
          {playing ? '一時停止' : '登りを再生'}
        </button>
        <input
          type="range"
          className="min-w-0 flex-1 accent-orange-500"
          min={0}
          max={duration}
          step={1 / track.fps}
          value={t}
          aria-label="再生位置"
          onChange={(e) => setT(Number(e.target.value))}
        />
        <span className="w-14 text-right text-xs text-slate-400 tabular-nums">{t.toFixed(1)} 秒</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button className={`min-h-11 rounded-lg px-3 ${showCom ? 'bg-yellow-400/20 text-yellow-300' : 'bg-slate-800 text-slate-400'}`} aria-pressed={showCom} onClick={() => setShowCom((v) => !v)}>
          重心の軌跡
        </button>
        <button className={`min-h-11 rounded-lg px-3 ${showFlow ? 'bg-slate-700 text-slate-100' : 'bg-slate-800 text-slate-400'}`} aria-pressed={showFlow} onClick={() => setShowFlow((v) => !v)}>
          手足の軌跡
        </button>
        {showFlow && FLOW.map(([name, , c]) => (
          <span key={name} className="flex items-center gap-1 text-slate-300">
            <i className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
