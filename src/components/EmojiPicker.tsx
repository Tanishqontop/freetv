import { useState } from 'react'
import { EMOJIS_3D, emojiGif } from '../lib/emojis'

export function EmojiPicker({
  disabled,
  onPick,
}: {
  disabled?: boolean
  onPick: (char: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-line bg-panel text-xl disabled:opacity-40"
        aria-label="3D emojis"
      >
        😎
      </button>
      {open && (
        <div className="absolute bottom-14 left-0 z-30 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-panel p-2 shadow-2xl">
          <p className="px-2 pb-2 text-[11px] uppercase tracking-wider text-mute">3D emojis</p>
          <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
            {EMOJIS_3D.map((emoji) => (
              <button
                key={emoji.char}
                type="button"
                title={emoji.label}
                onClick={() => {
                  onPick(emoji.char)
                  setOpen(false)
                }}
                className="grid aspect-square place-items-center rounded-xl p-1 transition hover:bg-white/10"
              >
                <img
                  src={emojiGif(emoji.code)}
                  alt={emoji.label}
                  className="emoji-3d h-9 w-9"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
