declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** PR プレビューで本番と別の IndexedDB を使うための DB 名 */
  readonly VITE_DB_NAME?: string
}
