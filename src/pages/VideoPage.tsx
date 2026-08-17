import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { EmojiBursts } from '../components/EmojiBursts'
import { EmojiPicker } from '../components/EmojiPicker'
import { ReportModal } from '../components/ReportModal'
import { SearchingOverlay } from '../components/SearchingOverlay'
import { SessionChrome } from '../components/SessionChrome'
import { useAuth } from '../hooks/useAuth'
import { useEmojiReactions } from '../hooks/useEmojiReactions'
import { useMatch } from '../hooks/useMatch'
import { useReport } from '../hooks/useReport'
import { useWebRTC } from '../hooks/useWebRTC'
import type { Interest } from '../lib/constants'

export function VideoPage() {
  const { userId, profile, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const interests = useMemo(
    () => (location.state as { interests?: Interest[] } | null)?.interests ?? [],
    [location.state],
  )
  const report = useReport()

  const [mediaError, setMediaError] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false

    async function grab() {
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        setLocalStream(stream)
      } catch {
        if (!cancelled) {
          setMediaError('Camera or microphone was blocked. Allow access, or switch to text chat.')
        }
      }
    }

    void grab()

    return () => {
      cancelled = true
      window.setTimeout(() => {
        stream?.getTracks().forEach((t) => t.stop())
      }, 400)
    }
  }, [])

  useEffect(() => {
    const el = localVideoRef.current
    if (!el || !localStream) return
    el.srcObject = localStream
    void el.play().catch(() => {
      /* autoplay can wait for a tap */
    })
  }, [localStream])

  const canMatch = Boolean(userId && profile?.age_confirmed_at && !profile.is_banned)

  const match = useMatch({
    mode: 'video',
    interests,
    userId,
    enabled: canMatch,
  })

  const webrtc = useWebRTC({
    sessionId: match.state === 'connected' ? match.session?.id ?? null : null,
    role: match.role,
    enabled: match.state === 'connected',
    localStream,
    userId,
  })

  const reactions = useEmojiReactions(
    match.state === 'connected' ? match.session?.id ?? null : null,
    userId,
    match.state === 'connected',
  )

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
    localStream?.getTracks().forEach((t) => t.stop())
    void match.stop()
    navigate('/')
  }

  const title =
    match.state === 'searching'
      ? 'Looking for a stranger…'
      : match.state === 'connected'
        ? "You're on camera with a stranger"
        : match.state === 'disconnected'
          ? 'Stranger disconnected'
          : 'Video chat'

  return (
    <div className="flex h-dvh flex-col bg-black">
      <SessionChrome
        title={title}
        onNext={() => void match.next()}
        onStop={onStop}
        onReport={() => report.setOpen(true)}
      >
        <button
          type="button"
          onClick={webrtc.toggleMute}
          className="rounded-xl border border-line px-3 py-2 text-sm"
        >
          {webrtc.muted ? 'Unmute' : 'Mute'}
        </button>
        <button
          type="button"
          onClick={webrtc.toggleCamera}
          className="rounded-xl border border-line px-3 py-2 text-sm"
        >
          {webrtc.cameraOff ? 'Camera on' : 'Camera off'}
        </button>
        <EmojiPicker
          disabled={match.state !== 'connected'}
          size="sm"
          placement="down"
          onPick={reactions.send}
        />
      </SessionChrome>

      <div
        className="relative min-h-0 flex-1 bg-ink"
        data-match={match.state}
        data-connection={webrtc.connection}
      >
        <video
          ref={webrtc.remoteVideoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />

        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className="absolute bottom-4 right-4 z-10 h-36 w-28 rounded-xl border border-white/20 object-cover shadow-xl sm:h-44 sm:w-32"
        />

        <EmojiBursts bursts={reactions.bursts} />

        {webrtc.needsTap && (
          <button
            type="button"
            onClick={webrtc.startPlayback}
            className="absolute inset-0 z-20 grid place-items-center bg-black/55"
          >
            <span className="rounded-2xl bg-acid px-5 py-3 font-semibold text-ink">Tap to show video</span>
          </button>
        )}

        {match.state === 'connected' && webrtc.connection !== 'connected' && (
          <p className="absolute left-4 top-4 z-10 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
            Connecting video…
          </p>
        )}

        {match.state === 'searching' && (
          <SearchingOverlay label="Finding a stranger" startedAt={match.startedAt} />
        )}

        {match.state === 'disconnected' && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/70">
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

        {mediaError && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-ink p-6 text-center">
            <div>
              <p className="font-display text-2xl font-bold">Camera needed</p>
              <p className="mt-2 max-w-sm text-mute">{mediaError}</p>
              <Link
                to="/chat"
                state={{ interests }}
                className="mt-5 inline-block rounded-xl bg-acid px-5 py-2 font-semibold text-ink"
              >
                Switch to text
              </Link>
            </div>
          </div>
        )}
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
