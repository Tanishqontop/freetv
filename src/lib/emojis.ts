export type Emoji3D = {
  char: string
  label: string
  code: string
}

const GIF = (code: string) =>
  `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.gif`

export const EMOJIS_3D: Emoji3D[] = [
  { char: '😀', label: 'Grinning', code: '1f600' },
  { char: '😂', label: 'Tears of joy', code: '1f602' },
  { char: '🤣', label: 'ROFL', code: '1f923' },
  { char: '😊', label: 'Smile', code: '1f60a' },
  { char: '😍', label: 'Heart eyes', code: '1f60d' },
  { char: '😘', label: 'Kiss', code: '1f618' },
  { char: '😎', label: 'Cool', code: '1f60e' },
  { char: '🤩', label: 'Star eyes', code: '1f929' },
  { char: '😇', label: 'Halo', code: '1f607' },
  { char: '😉', label: 'Wink', code: '1f609' },
  { char: '😭', label: 'Crying', code: '1f62d' },
  { char: '😡', label: 'Angry', code: '1f621' },
  { char: '🥺', label: 'Pleading', code: '1f97a' },
  { char: '😴', label: 'Sleepy', code: '1f634' },
  { char: '🤔', label: 'Thinking', code: '1f914' },
  { char: '😏', label: 'Smirk', code: '1f60f' },
  { char: '🤗', label: 'Hug', code: '1f917' },
  { char: '😜', label: 'Crazy', code: '1f61c' },
  { char: '😱', label: 'Scream', code: '1f631' },
  { char: '🥳', label: 'Party', code: '1f973' },
  { char: '💀', label: 'Skull', code: '1f480' },
  { char: '❤️', label: 'Heart', code: '2764' },
  { char: '🔥', label: 'Fire', code: '1f525' },
  { char: '✨', label: 'Sparkles', code: '2728' },
  { char: '👍', label: 'Thumbs up', code: '1f44d' },
  { char: '👎', label: 'Thumbs down', code: '1f44e' },
  { char: '👏', label: 'Clap', code: '1f44f' },
  { char: '🙏', label: 'Pray', code: '1f64f' },
  { char: '💪', label: 'Strong', code: '1f4aa' },
  { char: '✌️', label: 'Peace', code: '270c' },
  { char: '🤞', label: 'Fingers crossed', code: '1f91e' },
  { char: '👋', label: 'Wave', code: '1f44b' },
  { char: '💯', label: 'Hundred', code: '1f4af' },
  { char: '🎉', label: 'Tada', code: '1f389' },
  { char: '👀', label: 'Eyes', code: '1f440' },
  { char: '💋', label: 'Kiss mark', code: '1f48b' },
  { char: '🌹', label: 'Rose', code: '1f339' },
  { char: '🍕', label: 'Pizza', code: '1f355' },
  { char: '☕', label: 'Coffee', code: '2615' },
  { char: '💩', label: 'Poop', code: '1f4a9' },
]

const byChar = new Map(EMOJIS_3D.map((e) => [e.char, e]))

export function emojiGif(code: string) {
  return GIF(code)
}

export function isEmojiOnly(text: string) {
  let rest = text.trim()
  if (!rest) return false
  const keys = [...byChar.keys()].sort((a, b) => b.length - a.length)
  for (const key of keys) rest = rest.split(key).join('')
  return rest.replace(/\s/g, '') === ''
}

export function splitEmojiText(text: string) {
  const keys = [...byChar.keys()].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(${keys.map(escapeRegExp).join('|')})`, 'g')
  const parts: Array<{ type: 'text' | 'emoji'; value: string; code?: string }> = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ type: 'text', value: text.slice(last, index) })
    const found = byChar.get(match[0])
    parts.push({ type: 'emoji', value: match[0], code: found?.code })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts.length ? parts : [{ type: 'text' as const, value: text }]
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
