import { useObjectUrl } from '../lib/useObjectUrl'

export default function Thumb({ blob }: { blob?: Blob }) {
  const url = useObjectUrl(blob)
  return url ? (
    <img src={url} alt="" className="h-16 w-12 shrink-0 rounded object-cover" />
  ) : (
    <div className="grid h-16 w-12 shrink-0 place-items-center rounded bg-slate-700 text-xl">🧗</div>
  )
}
