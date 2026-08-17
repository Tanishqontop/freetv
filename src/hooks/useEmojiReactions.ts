import { useCallback, useEffect, useRef, useState } from 'react'
import { emojiByChar } from '../lib/emojis'
import { requireSupabase } from '../lib/supabase'

type Burst = {
  id: string
  code: string
  label: string
  left: number
}

export function useEmojiReactions(
  sessionId: string | null,
  userId: string | null,
  enabled: boolean,
) {
  const [bursts, setBursts] = useState<Burst[]>([])
  const channelRef = useRef<ReturnType<ReturnType<typeof requireSupabase>['channel']> | null>(null)

  const spawn = useCallback((char: string) => {
    const found = emojiByChar(char)
    if (!found) return
    const id = crypto.randomUUID()
    setBursts((prev) => [
      ...prev,
      { id, code: found.code, label: found.label, left: 8 + Math.random() * 72 },
    ])
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((item) => item.id !== id))
    }, 2600)
  }, [])

  useEffect(() => {
    if (!enabled || !sessionId || !userId) return
    const client = requireSupabase()
    const channel = client.channel(`emoji:${sessionId}`, {
      config: { broadcast: { ack: false, self: false } },
    })
    channelRef.current = channel

    channel.on('broadcast', { event: 'emoji' }, ({ payload }) => {
      if (!payload?.char || payload.userId === userId) return
      spawn(payload.char as string)
    })

    void channel.subscribe()
    return () => {
      channelRef.current = null
      void client.removeChannel(channel)
    }
  }, [enabled, sessionId, spawn, userId])

  const send = useCallback(
    (char: string) => {
      if (!emojiByChar(char) || !sessionId || !userId) return
      spawn(char)
      void channelRef.current?.send({
        type: 'broadcast',
        event: 'emoji',
        payload: { char, userId },
      })
      void requireSupabase().rpc('send_webrtc_signal', {
        p_session_id: sessionId,
        p_event: 'emoji',
        p_payload: { char },
      })
    },
    [sessionId, spawn, userId],
  )

  return { bursts, send }
}
