import { useEffect, useState } from 'react'

/** Blob の Object URL を作り、不要になったら破棄する */
export function useObjectUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return
    const u = URL.createObjectURL(blob)
    // Object URL は React 外のリソースなので effect で生成・破棄する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return blob ? url : undefined
}
