export type ChatMode = 'text' | 'video'
export type WebRtcRole = 'caller' | 'callee'
export type SessionStatus = 'active' | 'ended'
export type EndReason = 'next' | 'stop' | 'disconnect' | 'report' | 'timeout'
export type QueueStatus = 'waiting' | 'matched' | 'cancelled'

export type Profile = {
  id: string
  age_confirmed_at: string | null
  is_banned: boolean
  ban_reason: string | null
  report_count: number
  role: 'user' | 'admin'
  created_at: string
  last_seen_at: string
}

export type ChatSession = {
  id: string
  mode: ChatMode
  user_a: string
  user_b: string
  status: SessionStatus
  started_at: string
  ended_at: string | null
  ended_by: string | null
  end_reason: EndReason | null
}

export type ChatMessage = {
  id: string
  session_id: string
  sender_id: string
  body: string
  created_at: string
}

export type MatchSuccess =
  | { status: 'waiting' }
  | { status: 'matched'; sessionId: string; peerId: string; role: WebRtcRole }

export type MatchError = {
  error: 'banned' | 'age_required' | 'rate_limited'
  reason?: string | null
}

export type MatchResponse = MatchSuccess | MatchError

export type MatchState =
  | 'idle'
  | 'searching'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'banned'
