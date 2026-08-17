import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ChatTranscript } from '../components/ChatTranscript'
import { EmojiPicker } from '../components/EmojiPicker'
import { ReportModal } from '../components/ReportModal'
import { SearchingOverlay } from '../components/SearchingOverlay'
import { SessionChrome } from '../components/SessionChrome'
import { useAuth } from '../hooks/useAuth'
import { useMatch } from '../hooks/useMatch'
import { useReport } from '../hooks/useReport'
import { useTextSession } from '../hooks/useTextSession'
import type { Interest } from '../lib/constants'

export function ChatPage() {
  const { userId, profile, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const interests = useMemo(
    () => (location.state as { interests?: Interest[] } | null)?.interests ?? [],
    [location.state],
  )
  const report = useReport()
  const [draft, setDraft] = useState('')

  const match = useMatch({
    mode: 'text',
    interests,
    userId,
    enabled: Boolean(userId && profile?.age_confirmed_at && !profile.is_banned),
  })

  const connected = match.state === 'connected'
  const text = useTextSession(connected ? match.session?.id ?? null : null, userId)

  if (loading) {
    return <div className="grid min-h-dvh place-items-center text-mute">Loading…</div>
  }
  if (!profile?.age_confirmed_at) return <Navigate to="/" replace />

  async function onReport(reason: Parameters<typeof report.submit>[1], details: string) {
    if (!match.session) return
    await report.submit(match.session.id, reason, details)
    await match.reportAndLeave()
    void match.startSearch()
  }

  function onStop() {
    void match.stop()
    navigate('/')
  }

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault()
    const value = draft
    setDraft('')
    await text.send(value)
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void onSubmit()
    } else {
      text.signalTyping()
    }
  }

  const title =
    match.state === 'searching'
      ? 'Looking for a stranger…'
      : match.state === 'connected'
        ? "You're chatting with a stranger"
        : match.state === 'disconnected'
          ? 'Stranger disconnected'
          : 'Text chat'

  return (
    <div className="flex h-dvh flex-col bg-ink">
      <SessionChrome
        title={title}
        onNext={() => void match.next()}
        onStop={onStop}
        onReport={() => report.setOpen(true)}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {match.state === 'searching' && (
          <SearchingOverlay label="Finding a stranger" startedAt={match.startedAt} />
        )}
        {match.state === 'disconnected' && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-ink/80">
            <div className="text-center">
              <p className="font-display text-2xl font-bold">Stranger disconnected</p>
              <button
                type="button"
                onClick={() => void match.next()}
                className="mt-4 rounded-xl bg-acid px-5 py-2 font-semibold text-ink"
              >
                Find someone else
              </button>
            </div>
          </div>
        )}
        {match.state === 'error' && (
          <p className="px-4 py-3 text-sm text-red-400">{match.error}</p>
        )}

        <ChatTranscript
          messages={text.messages}
          userId={userId}
          peerTyping={text.peerTyping}
          emptyHint={
            connected ? 'Say hello. You are chatting with a stranger.' : 'Waiting to be paired…'
          }
        />

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="flex items-end gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <EmojiPicker
            disabled={!connected}
            onPick={(char) => setDraft((prev) => (prev + char).slice(0, 2000))}
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            onKeyDown={onKey}
            disabled={!connected}
            placeholder={connected ? 'Type a message or tap a 3D emoji' : 'Waiting to connect…'}
            rows={2}
            className="min-w-0 flex-1 resize-none rounded-2xl border border-line bg-panel px-4 py-3 outline-none focus:border-acid disabled:opacity-50"
          />
        </form>
      </div>

      <ReportModal
        open={report.open}
        busy={report.busy}
        onClose={() => report.setOpen(false)}
        onSubmit={(reason, details) => void onReport(reason, details)}
      />
    </div>
  )
}
