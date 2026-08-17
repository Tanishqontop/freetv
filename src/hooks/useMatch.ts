import { useCallback, useEffect, useRef, useState } from 'react'
import { requireSupabase } from '../lib/supabase'
import type { ChatMode, ChatSession, MatchResponse, MatchState, WebRtcRole } from '../lib/types'

type Options = {
  mode: ChatMode
  interests: string[]
  userId: string | null
  enabled: boolean
}

export function useMatch({ mode, interests, userId, enabled }: Options) {
  const [state, setState] = useState<MatchState>('idle')
  const [session, setSession] = useState<ChatSession | null>(null)
  const [role, setRole] = useState<WebRtcRole | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)

  const sessionIdRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const leaveTimerRef = useRef<number | undefined>(undefined)
  const aliveRef = useRef(0)
  const searchingRef = useRef(false)

  const applySession = useCallback((row: ChatSession, id: string) => {
    sessionIdRef.current = row.id
    searchingRef.current = false
    setSession(row)
    setRole(row.user_a === id ? 'caller' : 'callee')
    setState(row.status === 'active' ? 'connected' : 'disconnected')
  }, [])

  const fetchSession = useCallback(
    async (sessionId: string, id: string) => {
      const client = requireSupabase()
      const { data, error: queryError } = await client
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle()

      if (queryError || !data) return
      applySession(data as ChatSession, id)
    },
    [applySession],
  )

  const claimMatch = useCallback(
    async (id: string) => {
      if (sessionIdRef.current) return
      const client = requireSupabase()

      const queued = await client
        .from('match_queue')
        .select('session_id, status')
        .eq('user_id', id)
        .eq('status', 'matched')
        .not('session_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (queued.data?.session_id) {
        await fetchSession(queued.data.session_id as string, id)
        return
      }

      const active = await client
        .from('chat_sessions')
        .select('*')
        .eq('status', 'active')
        .or(`user_a.eq.${id},user_b.eq.${id}`)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (active.data) applySession(active.data as ChatSession, id)
    },
    [applySession, fetchSession],
  )

  const startSearch = useCallback(async () => {
    if (!userId) return
    const gen = ++generationRef.current
    setError(null)
    setSession(null)
    setRole(null)
    sessionIdRef.current = null
    searchingRef.current = true
    setState('searching')
    setStartedAt((prev) => prev ?? Date.now())

    const client = requireSupabase()
    const { data, error: rpcError } = await client.rpc('match_user', {
      p_mode: mode,
      p_interests: interests,
    })

    if (gen !== generationRef.current) return

    if (rpcError) {
      setState('error')
      setError(rpcError.message)
      return
    }

    const result = data as MatchResponse
    if ('error' in result) {
      if (result.error === 'banned') setState('banned')
      else if (result.error === 'age_required') {
        setState('error')
        setError('Confirm you are 18+ on the home page first.')
      } else if (result.error === 'rate_limited') {
        window.setTimeout(() => {
          if (generationRef.current === gen) void startSearch()
        }, 2000)
      } else {
        setState('error')
        setError('Could not find a stranger. Try again.')
      }
      return
    }

    if (result.status === 'matched') {
      searchingRef.current = false
      await fetchSession(result.sessionId, userId)
    } else {
      searchingRef.current = true
      window.setTimeout(() => {
        if (generationRef.current === gen && !sessionIdRef.current) {
          void claimMatch(userId)
        }
      }, 400)
    }
  }, [claimMatch, fetchSession, interests, mode, userId])

  const endCurrent = useCallback(async (reason: 'next' | 'stop' | 'disconnect' | 'report') => {
    const id = sessionIdRef.current
    generationRef.current += 1
    const client = requireSupabase()

    if (id) {
      await client.rpc('end_session', { p_session_id: id, p_reason: reason })
    } else {
      await client.rpc('leave_queue')
    }

    sessionIdRef.current = null
    setSession(null)
    setRole(null)

    if (reason === 'next') {
      await startSearch()
    } else {
      setState('idle')
      setStartedAt(null)
    }
  }, [startSearch])

  useEffect(() => {
    if (!enabled || !userId) return
    const token = ++aliveRef.current
    window.clearTimeout(leaveTimerRef.current)
    void startSearch()

    const onPageHide = () => {
      const id = sessionIdRef.current
      const client = requireSupabase()
      if (id) {
        void client.rpc('end_session', { p_session_id: id, p_reason: 'disconnect' })
      } else {
        void client.rpc('leave_queue')
      }
    }
    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      generationRef.current += 1
      const id = sessionIdRef.current
      leaveTimerRef.current = window.setTimeout(() => {
        if (aliveRef.current !== token) return
        const client = requireSupabase()
        if (id) {
          void client.rpc('end_session', { p_session_id: id, p_reason: 'disconnect' })
        } else {
          void client.rpc('leave_queue')
        }
      }, 1500)
    }
  }, [enabled, startSearch, userId])

  useEffect(() => {
    if (!enabled || !userId) return
    const client = requireSupabase()

    const queueChannel = client
      .channel(`queue:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_queue',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { status?: string; session_id?: string | null }
          if (row.status === 'matched' && row.session_id) {
            void fetchSession(row.session_id, userId)
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_sessions' },
        (payload) => {
          const row = payload.new as ChatSession
          if (row.user_a === userId || row.user_b === userId) {
            searchingRef.current = false
            applySession(row, userId)
          }
        },
      )
      .subscribe()

    const poll = window.setInterval(() => {
      if (!sessionIdRef.current) void claimMatch(userId)
    }, 800)

    const rematch = window.setInterval(() => {
      if (!sessionIdRef.current && searchingRef.current) void startSearch()
    }, 8000 + Math.floor(Math.random() * 4000))

    return () => {
      window.clearInterval(poll)
      window.clearInterval(rematch)
      void client.removeChannel(queueChannel)
    }
  }, [applySession, claimMatch, enabled, fetchSession, startSearch, userId])

  useEffect(() => {
    if (!session?.id || !userId) return
    const client = requireSupabase()

    const sessionChannel = client
      .channel(`session-row:${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const row = payload.new as ChatSession
          if (row.status === 'ended') {
            sessionIdRef.current = null
            setSession(row)
            setState('disconnected')
          }
        },
      )
      .subscribe()

    const joinedAt = Date.now()
    const presence = client.channel(`presence:session:${session.id}`, {
      config: { presence: { key: userId } },
    })

    presence.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      if (Date.now() - joinedAt < 2000) return
      const left = leftPresences.some((p) => {
        const row = p as { userId?: string }
        return Boolean(row.userId && row.userId !== userId)
      })
      if (left && sessionIdRef.current === session.id) {
        void client.rpc('end_session', {
          p_session_id: session.id,
          p_reason: 'disconnect',
        })
        sessionIdRef.current = null
        setState('disconnected')
      }
    })

    void presence.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presence.track({ userId, at: Date.now() })
      }
    })

    return () => {
      void client.removeChannel(sessionChannel)
      void client.removeChannel(presence)
    }
  }, [session?.id, userId])

  return {
    state,
    session,
    role,
    error,
    startedAt,
    startSearch,
    next: () => endCurrent('next'),
    stop: () => endCurrent('stop'),
    disconnect: () => endCurrent('disconnect'),
    reportAndLeave: () => endCurrent('report'),
  }
}
