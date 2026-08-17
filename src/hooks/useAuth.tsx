import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { requireSupabase, supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

type AuthContextValue = {
  loading: boolean
  userId: string | null
  profile: Profile | null
  error: string | null
  confirmAge: () => Promise<boolean>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = useCallback(async (id: string) => {
    const client = requireSupabase()
    const { data, error: queryError } = await client
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (queryError) {
      throw queryError
    }

    if (!data) {
      await new Promise((r) => setTimeout(r, 400))
      const retry = await client.from('profiles').select('*').eq('id', id).maybeSingle()
      setProfile((retry.data as Profile | null) ?? null)
      return
    }

    setProfile(data as Profile)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function boot() {
      try {
        const client = requireSupabase()
        const existing = await client.auth.getSession()
        let id = existing.data.session?.user.id

        if (!id) {
          const { data, error: authError } = await client.auth.signInAnonymously()
          if (authError) {
            throw authError
          }
          id = data.user?.id
        }

        if (!id || cancelled) return
        setUserId(id)
        await loadProfile(id)
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Could not start a session'
          setError(
            message.includes('Anonymous')
              ? 'Anonymous sign-ins are disabled. Enable them in Supabase: Authentication → Providers → Anonymous.'
              : message,
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void boot()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null
      setUserId(id)
      if (id) void loadProfile(id)
      else setProfile(null)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  useEffect(() => {
    if (!userId || !supabase) return

    const tick = () => {
      void supabase!.rpc('heartbeat')
    }

    tick()
    const timer = window.setInterval(tick, 20_000)
    return () => window.clearInterval(timer)
  }, [userId])

  const confirmAge = useCallback(async () => {
    const client = requireSupabase()
    const { data, error: rpcError } = await client.rpc('confirm_age')
    if (rpcError) {
      setError(rpcError.message)
      return false
    }
    const payload = data as { ok?: boolean; error?: string }
    if (payload?.error === 'banned') {
      await loadProfile(userId!)
      return false
    }
    if (userId) await loadProfile(userId)
    return true
  }, [loadProfile, userId])

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId)
  }, [loadProfile, userId])

  const value = useMemo(
    () => ({ loading, userId, profile, error, confirmAge, refreshProfile }),
    [loading, userId, profile, error, confirmAge, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
