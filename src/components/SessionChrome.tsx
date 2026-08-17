import type { ReactNode } from 'react'
import { OnlineBadge } from './OnlineBadge'
import { useOnlineCount } from '../hooks/useOnlineCount'

export function SessionChrome({
  title,
  onNext,
  onStop,
  onReport,
  children,
}: {
  title: string
  onNext: () => void
  onStop: () => void
  onReport: () => void
  children?: ReactNode
}) {
  const online = useOnlineCount()

  return (
    <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <p className="font-display text-lg font-bold">
          FREE<span className="text-acid">TV</span>
        </p>
        <p className="text-xs text-mute">{title}</p>
        <OnlineBadge count={online} size="sm" />
      </div>
      <div className="flex items-center gap-2">
        {children}
        <button
          type="button"
          onClick={onReport}
          className="rounded-xl border border-line px-3 py-2 text-sm text-mute hover:text-white"
        >
          Report
        </button>
        <button
          type="button"
          onClick={onStop}
          className="rounded-xl border border-line px-3 py-2 text-sm hover:border-white"
        >
          Stop
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-xl bg-acid px-4 py-2 text-sm font-semibold text-ink"
        >
          Next
        </button>
      </div>
    </header>
  )
}
