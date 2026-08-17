import { emojiGif } from '../lib/emojis'

export function EmojiBursts({
  bursts,
}: {
  bursts: { id: string; code: string; label: string; left: number }[]
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {bursts.map((burst) => (
        <img
          key={burst.id}
          src={emojiGif(burst.code)}
          alt={burst.label}
          className="emoji-3d emoji-float"
          style={{ left: `${burst.left}%` }}
        />
      ))}
    </div>
  )
}
