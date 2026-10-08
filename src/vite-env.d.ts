/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base for the Cloudflare D1 API when syncing (defaults to /api). */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}