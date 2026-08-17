export const INTERESTS = [
  'music',
  'movies',
  'gaming',
  'sports',
  'tech',
  'art',
  'travel',
  'anime',
  'fitness',
  'food',
] as const

export type Interest = (typeof INTERESTS)[number]

export const REPORT_REASONS = [
  { id: 'harassment', label: 'Harassment or hate' },
  { id: 'sexual_content', label: 'Sexual content I did not want' },
  { id: 'spam', label: 'Spam or scam' },
  { id: 'underage_suspicion', label: 'I think this person is under 18' },
  { id: 'other', label: 'Other' },
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]['id']

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]

if (import.meta.env.VITE_TURN_URL) {
  ICE_SERVERS.push({
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  })
}
