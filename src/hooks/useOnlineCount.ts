import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useOnlineCount() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!supabase) return

    let cancelled = false

    async function load() {
      const { data } = await supabase!.rpc('online_count')
      if (!cancelled && typeof data === 'number') setCount(data)
    }

    void load()
    const timer = window.setInterval(load, 15_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return count
}
