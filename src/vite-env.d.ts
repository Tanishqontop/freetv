/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_TURN_URL: string
  readonly VITE_TURN_USERNAME: string
  readonly VITE_TURN_CREDENTIAL: string
  readonly VITE_METERED_TURN_API_KEY: string
  readonly VITE_METERED_TURN_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
