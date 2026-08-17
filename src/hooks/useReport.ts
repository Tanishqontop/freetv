import { useCallback, useState } from 'react'
import { requireSupabase } from '../lib/supabase'
import type { ReportReason } from '../lib/constants'

export function useReport() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = useCallback(
    async (sessionId: string, reason: ReportReason, details: string) => {
      setBusy(true)
      const client = requireSupabase()
      const { data, error } = await client.rpc('submit_report', {
        p_session_id: sessionId,
        p_reason: reason,
        p_details: details,
      })
      setBusy(false)
      setOpen(false)
      if (error) return { ok: false as const, error: error.message }
      const payload = data as { ok?: boolean; error?: string }
      if (payload?.error) return { ok: false as const, error: payload.error }
      return { ok: true as const }
    },
    [],
  )

  return { open, setOpen, busy, submit }
}
