import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useOnlineCount() {
  const { userId } = useAuth()
  const [count, setCount] = useState<number | null>(null)
  const presenceRef = useRef(0)
  const rpcRef = useRef(0)

  useEffect(() => {
    if (!supabase) return

    let cancelled = false

    const publish = () => {
      if (cancelled) return
      const n = Math.max(presenceRef.current, rpcRef.current, userId ? 1 : 0)
      setCount(n)
    }

    async function loadRpc() {
      const { data } = await supabase!.rpc('online_count')
      if (typeof data === 'number') {
        rpcRef.current = data
        publish()
      } else if (userId) {
        publish()
      }
    }

    void loadRpc()
    const timer = window.setInterval(loadRpc, 8_000)

    const channel = supabase.channel('freetv-online', {
      config: {
        presence: { key: userId ?? crypto.randomUUID() },
      },
    })

    channel.on('presence', { event: 'sync' }, () => {
      presenceRef.current = Object.keys(channel.presenceState()).length
      publish()
    })

    void channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED' || cancelled) return
      await channel.track({ at: Date.now() })
    })

    return () => {
      cancelled = true
      window.clearInterval(timer)
      void supabase!.removeChannel(channel)
    }
  }, [userId])

  return count
}
