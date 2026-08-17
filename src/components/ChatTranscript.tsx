import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../lib/types'

export function ChatTranscript({
  messages,
  userId,
  peerTyping,
  emptyHint,
}: {
  messages: ChatMessage[]
  userId: string | null
  peerTyping: boolean
  emptyHint?: string
}) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, peerTyping])

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.length === 0 && (
        <p className="text-center text-sm text-mute">
          {emptyHint ?? 'Messages will show up here.'}
        </p>
      )}
      {messages.map((message) => {
        const mine = message.sender_id === userId
        return (
          <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-[15px] leading-relaxed ${
                mine ? 'bg-acid text-ink' : 'bg-panel text-white'
              }`}
            >
              {message.body}
            </div>
          </div>
        )
      })}
      {peerTyping && <p className="text-sm text-mute">Stranger is typing…</p>}
      <div ref={endRef} />
    </div>
  )
}
