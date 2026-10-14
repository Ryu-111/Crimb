/** 未保存の Draft を持ちうる画面（ここで SW 更新のリロードをすると撮影・解析結果が消える） */
export const isDraftRoute = (hash: string) => /^#\/(new|analyze|result)(?:[/?]|$)/.test(hash)

/** 新しい SW が有効になったら、Draft の画面を離れてからリロードする */
export function reloadWhenIdle(): void {
  const tryReload = () => {
    if (isDraftRoute(location.hash)) return false
    location.reload()
    return true
  }
  if (tryReload()) return
  const onHash = () => {
    if (tryReload()) window.removeEventListener('hashchange', onHash)
  }
  window.addEventListener('hashchange', onHash)
}
