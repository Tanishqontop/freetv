import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { requireSupabase } from '../lib/supabase'
import type { ChatMessage } from '../lib/types'

export function useTextSession(sessionId: string | null, userId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [peerTyping, setPeerTyping] = useState(false)
  const [sending, setSending] = useState(false)
  const typingTimer = useRef<number | undefined>(undefined)
  const typingChannelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    setMessages([])
    setPeerTyping(false)
    if (!sessionId) return

    const client = requireSupabase()
    let cancelled = false

    void client
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!cancelled && data) setMessages(data as ChatMessage[])
      })

    const channel = client
      .channel(`messages:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
        },
      )
      .subscribe()

    const typing = client.channel(`typing:${sessionId}`)
    typingChannelRef.current = typing
    typing.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload?.userId === userId) return
      setPeerTyping(true)
      window.clearTimeout(typingTimer.current)
      typingTimer.current = window.setTimeout(() => setPeerTyping(false), 1500)
    })
    void typing.subscribe()

    return () => {
      cancelled = true
      typingChannelRef.current = null
      window.clearTimeout(typingTimer.current)
      void client.removeChannel(channel)
      void client.removeChannel(typing)
    }
  }, [sessionId, userId])

  const send = useCallback(
    async (raw: string) => {
      if (!sessionId || !userId) return
      const body = raw.trim()
      if (!body) return
      setSending(true)
      const client = requireSupabase()
      const optimistic: ChatMessage = {
        id: `local-${crypto.randomUUID()}`,
        session_id: sessionId,
        sender_id: userId,
        body: body.slice(0, 2000),
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, optimistic])

      const { data, error } = await client
        .from('messages')
        .insert({ session_id: sessionId, sender_id: userId, body: optimistic.body })
        .select('*')
        .single()

      setSending(false)

      if (error || !data) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        return
      }

      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? (data as ChatMessage) : m)))
    },
    [sessionId, userId],
  )

  const signalTyping = useCallback(() => {
    if (!sessionId || !userId) return
    void typingChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId },
    })
  }, [sessionId, userId])

  return { messages, peerTyping, sending, send, signalTyping }
}
