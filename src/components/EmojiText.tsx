import { emojiGif, isEmojiOnly, splitEmojiText } from '../lib/emojis'

export function EmojiText({ text }: { text: string }) {
  const parts = splitEmojiText(text)
  const emojiCount = parts.filter((part) => part.type === 'emoji').length
  const large = isEmojiOnly(text) && emojiCount > 0 && emojiCount <= 6

  return (
    <span className={large ? 'flex flex-wrap items-center justify-center gap-1' : undefined}>
      {parts.map((part, index) => {
        if (part.type !== 'emoji' || !part.code) {
          return <span key={index}>{part.value}</span>
        }
        return (
          <img
            key={index}
            src={emojiGif(part.code)}
            alt={part.value}
            title={part.value}
            className={large ? 'emoji-3d emoji-3d-lg' : 'emoji-3d emoji-3d-inline'}
          />
        )
      })}
    </span>
  )
}
