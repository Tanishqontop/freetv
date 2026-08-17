async function hmacSha1Base64(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  const bytes = new Uint8Array(sig)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

async function openRelayServers(): Promise<RTCIceServer[]> {
  const username = `${Math.floor(Date.now() / 1000) + 12 * 3600}:freetv`
  const credential = await hmacSha1Base64('openrelayprojectsecret', username)
  return [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
        'stun:staticauth.openrelay.metered.ca:80',
        'stun:staticauth.openrelay.metered.ca:443',
      ],
    },
    {
      urls: [
        'turn:staticauth.openrelay.metered.ca:80',
        'turn:staticauth.openrelay.metered.ca:80?transport=tcp',
        'turn:staticauth.openrelay.metered.ca:443',
        'turn:staticauth.openrelay.metered.ca:443?transport=tcp',
        'turns:staticauth.openrelay.metered.ca:443',
        'turns:staticauth.openrelay.metered.ca:443?transport=tcp',
      ],
      username,
      credential,
    },
  ]
}

function extraTurnFromEnv(): RTCIceServer[] {
  const url = import.meta.env.VITE_TURN_URL
  if (!url) return []
  return [
    {
      urls: url,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    },
  ]
}

let cached: { at: number; servers: RTCIceServer[] } | null = null

export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.servers

  const servers = [...(await openRelayServers()), ...extraTurnFromEnv()]

  const apiKey = import.meta.env.VITE_METERED_TURN_API_KEY
  const apiUrl = import.meta.env.VITE_METERED_TURN_URL
  if (apiKey && apiUrl) {
    try {
      const res = await fetch(`${apiUrl}?apiKey=${encodeURIComponent(apiKey)}`)
      if (res.ok) {
        const remote = (await res.json()) as RTCIceServer[]
        if (Array.isArray(remote) && remote.length) servers.unshift(...remote)
      }
    } catch {
      /* keep Open Relay */
    }
  }

  cached = { at: Date.now(), servers }
  return servers
}
