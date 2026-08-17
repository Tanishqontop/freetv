import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { InterestChips } from '../components/InterestChips'
import { Logo } from '../components/Logo'
import { OnlineBadge } from '../components/OnlineBadge'
import { useAuth } from '../hooks/useAuth'
import { useOnlineCount } from '../hooks/useOnlineCount'
import type { Interest } from '../lib/constants'

export function HomePage() {
  const { loading, profile, error, confirmAge } = useAuth()
  const online = useOnlineCount()
  const navigate = useNavigate()
  const [ageOk, setAgeOk] = useState(Boolean(profile?.age_confirmed_at))
  const [interests, setInterests] = useState<Interest[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile?.age_confirmed_at) setAgeOk(true)
  }, [profile?.age_confirmed_at])

  const confirmed = Boolean(profile?.age_confirmed_at) || ageOk

  async function start(mode: 'text' | 'video') {
    if (!confirmed) return
    setBusy(true)
    const ok = await confirmAge()
    setBusy(false)
    if (!ok) return
    navigate(mode === 'text' ? '/chat' : '/video', { state: { interests } })
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(196,245,66,0.12),_transparent_45%)]" />
      <div className="grain pointer-events-none absolute inset-0 opacity-25" />

      <div className="relative mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-8">
        <header className="flex items-center justify-between">
          <Logo size="sm" />
          <OnlineBadge count={online} size="sm" />
        </header>

        <main className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-acid">Random strangers · no signup</p>
          <Logo size="lg" />
          <div className="mt-5">
            <OnlineBadge count={online} size="lg" />
          </div>
          <p className="mt-4 max-w-md text-lg text-mute">
            Talk to a random stranger. Free. Text or video. Skip anyone, anytime.
          </p>

          {loading && <p className="mt-8 text-mute">Starting a private session…</p>}
          {error && <p className="mt-6 max-w-md text-sm text-red-400">{error}</p>}

          <label className="mt-8 flex max-w-md cursor-pointer items-start gap-3 rounded-2xl border border-line bg-panel/80 px-4 py-3 text-left">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setAgeOk(e.target.checked)}
              className="mt-1 accent-[#c4f542]"
            />
            <span className="text-sm">
              I confirm I am <strong>18 or older</strong>. FreeTV is not for minors. Sexual content
              involving anyone under 18 is illegal and will be reported.
            </span>
          </label>

          <div className="mt-8 grid w-full max-w-lg gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!confirmed || loading || busy}
              onClick={() => void start('text')}
              className="rounded-2xl border border-line bg-panel px-6 py-6 text-left transition hover:border-acid disabled:opacity-40"
            >
              <p className="font-display text-2xl font-bold">Text</p>
              <p className="mt-1 text-sm text-mute">Chat with a stranger</p>
            </button>
            <button
              type="button"
              disabled={!confirmed || loading || busy}
              onClick={() => void start('video')}
              className="rounded-2xl bg-acid px-6 py-6 text-left text-ink transition hover:bg-acid-dim disabled:opacity-40"
            >
              <p className="font-display text-2xl font-bold">Video</p>
              <p className="mt-1 text-sm text-ink/70">Camera + mic, then match</p>
            </button>
          </div>

          <div className="mt-10 w-full max-w-lg">
            <p className="mb-3 text-sm text-mute">Optional interests — better matches if they overlap</p>
            <InterestChips selected={interests} onChange={setInterests} />
          </div>
        </main>

        <footer className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-8 text-sm text-mute">
          <Link to="/legal/terms" className="hover:text-white">
            Terms
          </Link>
          <Link to="/legal/privacy" className="hover:text-white">
            Privacy
          </Link>
          <Link to="/legal/guidelines" className="hover:text-white">
            Guidelines
          </Link>
        </footer>
      </div>
    </div>
  )
}
