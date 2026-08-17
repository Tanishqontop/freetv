import { useEffect, useState } from 'react'

export function SearchingOverlay({
  label,
  startedAt,
}: {
  label: string
  startedAt: number | null
}) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const seconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-ink/80 backdrop-blur-sm">
      <div className="relative grid place-items-center">
        <span className="pulse-ring absolute h-40 w-40 rounded-full border border-acid/40" />
        <span className="pulse-ring pulse-ring-delay absolute h-40 w-40 rounded-full border border-acid/25" />
        <div className="relative text-center">
          <p className="font-display text-2xl font-bold">{label}</p>
          <p className="mt-2 max-w-xs text-sm text-mute">
            {seconds > 0 ? `Waiting ${seconds}s` : 'Looking for a stranger'}
          </p>
          <p className="mt-3 max-w-xs text-xs text-mute">
            The other person must also tap Video. People only on the home page will not match.
          </p>
        </div>
      </div>
    </div>
  )
}
