import { useCallback, useEffect, useRef, useState } from 'react'
import { getIceServers } from '../lib/iceServers'
import { requireSupabase } from '../lib/supabase'
import type { WebRtcRole } from '../lib/types'

type Options = {
  sessionId: string | null
  role: WebRtcRole | null
  enabled: boolean
  localStream: MediaStream | null
  userId: string | null
}

function sdpPayload(desc: RTCSessionDescription | RTCSessionDescriptionInit) {
  return { type: desc.type, sdp: desc.sdp }
}

export function useWebRTC({ sessionId, role, enabled, localStream, userId }: Options) {
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteStreamRef = useRef(new MediaStream())
  const [connection, setConnection] = useState<'new' | 'connecting' | 'connected' | 'failed'>('new')
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)

  const attachRemote = useCallback(() => {
    const el = remoteVideoRef.current
    const stream = remoteStreamRef.current
    if (!el || stream.getTracks().length === 0) return
    if (el.srcObject !== stream) el.srcObject = stream
    const play = el.play()
    if (play) {
      void play.then(() => setNeedsTap(false)).catch(() => setNeedsTap(true))
    }
  }, [])

  const startPlayback = useCallback(() => {
    setNeedsTap(false)
    attachRemote()
  }, [attachRemote])

  useEffect(() => {
    if (!enabled || !sessionId || !role || !localStream || !userId) return

    const stream = localStream
    const me = userId
    const sid = sessionId
    const client = requireSupabase()
    let closed = false
    let retry: number | undefined
    let poll: number | undefined
    let broadcast: ReturnType<typeof client.channel> | null = null
    let dbChannel: ReturnType<typeof client.channel> | null = null
    let dyingPc: RTCPeerConnection | null = null
    const seen = new Set<string>()

    async function start() {
      const iceServers = await getIceServers()
      if (closed) return

      let gotOffer = false
      let gotAnswer = false
      const pendingIce: RTCIceCandidateInit[] = []
      const remoteStream = new MediaStream()
      remoteStreamRef.current = remoteStream

      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 8,
      })
      dyingPc = pc

      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream)
      }

      pc.ontrack = (event) => {
        const incoming = event.streams[0]
        if (incoming) {
          for (const t of incoming.getTracks()) {
            if (!remoteStream.getTracks().some((x) => x.id === t.id)) remoteStream.addTrack(t)
          }
        } else if (!remoteStream.getTracks().some((x) => x.id === event.track.id)) {
          remoteStream.addTrack(event.track)
        }
        attachRemote()
      }

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        if (state === 'connected') setConnection('connected')
        else if (state === 'failed' || state === 'closed') setConnection('failed')
        else if (state === 'connecting') setConnection('connecting')
      }

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setConnection('connected')
        } else if (pc.iceConnectionState === 'failed') {
          setConnection('failed')
          void pc.restartIce()
        }
      }

      const channel = client.channel(`webrtc:${sid}`, {
        config: { broadcast: { ack: false, self: false } },
      })
      broadcast = channel

      const send = (event: string, payload: unknown) => {
        void channel.send({ type: 'broadcast', event, payload })
        void client.rpc('send_webrtc_signal', {
          p_session_id: sid,
          p_event: event,
          p_payload: payload ?? {},
        })
      }

      const applySignal = async (event: string, payload: unknown) => {
        if (closed) return
        if (event === 'ready' && role === 'caller') {
          void makeOffer()
          return
        }
        if (event === 'offer' && role === 'callee') {
          const body = payload as RTCSessionDescriptionInit | null
          if (!body?.sdp || pc.currentRemoteDescription) return
          gotOffer = true
          await pc.setRemoteDescription(new RTCSessionDescription(body))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          send('answer', sdpPayload(pc.localDescription ?? answer))
          for (const ice of pendingIce) await pc.addIceCandidate(ice)
          pendingIce.length = 0
          return
        }
        if (event === 'answer' && role === 'caller') {
          const body = payload as RTCSessionDescriptionInit | null
          if (!body?.sdp) return
          gotAnswer = true
          if (pc.currentRemoteDescription) return
          await pc.setRemoteDescription(new RTCSessionDescription(body))
          for (const ice of pendingIce) await pc.addIceCandidate(ice)
          pendingIce.length = 0
          return
        }
        if (event === 'ice' && payload) {
          if (!pc.remoteDescription) {
            pendingIce.push(payload as RTCIceCandidateInit)
            return
          }
          try {
            await pc.addIceCandidate(payload as RTCIceCandidateInit)
          } catch {
            /* ignore stale ICE */
          }
        }
        if (event === 'hangup') setConnection('failed')
      }

      const makeOffer = async () => {
        if (closed || role !== 'caller' || gotAnswer) return
        try {
          if (pc.signalingState === 'stable') {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
            })
            await pc.setLocalDescription(offer)
          }
          if (pc.localDescription) send('offer', sdpPayload(pc.localDescription))
        } catch {
          /* overlapping offer */
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) send('ice', event.candidate.toJSON())
      }

      channel
        .on('broadcast', { event: 'ready' }, ({ payload }) => void applySignal('ready', payload))
        .on('broadcast', { event: 'offer' }, ({ payload }) => void applySignal('offer', payload))
        .on('broadcast', { event: 'answer' }, ({ payload }) => void applySignal('answer', payload))
        .on('broadcast', { event: 'ice' }, ({ payload }) => void applySignal('ice', payload))
        .on('broadcast', { event: 'hangup' }, () => void applySignal('hangup', {}))

      const pullSignals = async () => {
        const { data } = await client
          .from('webrtc_signals')
          .select('id, event, payload, sender_id')
          .eq('session_id', sid)
          .neq('sender_id', me)
          .order('created_at', { ascending: true })
          .limit(80)

        for (const row of data ?? []) {
          const id = row.id as string
          if (seen.has(id)) continue
          seen.add(id)
          await applySignal(row.event as string, row.payload)
        }
      }

      void channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED' || closed) return
        setConnection('connecting')
        send('ready', { role })
      })

      dbChannel = client
        .channel(`webrtc-db:${sid}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'webrtc_signals',
            filter: `session_id=eq.${sid}`,
          },
          (payload) => {
            const row = payload.new as {
              id?: string
              sender_id?: string
              event?: string
              payload?: unknown
            }
            if (!row.event || row.sender_id === me) return
            if (row.id) {
              if (seen.has(row.id)) return
              seen.add(row.id)
            }
            void applySignal(row.event, row.payload)
          },
        )

      void dbChannel.subscribe()
      void pullSignals()

      retry = window.setInterval(() => {
        if (closed) return
        if (role === 'callee' && !gotOffer) send('ready', { role })
        if (role === 'caller' && !gotAnswer) void makeOffer()
      }, 1500)

      poll = window.setInterval(() => {
        if (!closed) void pullSignals()
      }, 700)
    }

    void start()

    return () => {
      closed = true
      if (retry) window.clearInterval(retry)
      if (poll) window.clearInterval(poll)
      const ch = broadcast
      const db = dbChannel
      const pc = dyingPc
      window.setTimeout(() => {
        if (ch) void client.removeChannel(ch)
        if (db) void client.removeChannel(db)
        pc?.close()
      }, 400)
    }
  }, [attachRemote, enabled, localStream, role, sessionId, userId])

  const toggleMute = useCallback(() => {
    const next = !muted
    setMuted(next)
    localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !next
    })
  }, [localStream, muted])

  const toggleCamera = useCallback(() => {
    const next = !cameraOff
    setCameraOff(next)
    localStream?.getVideoTracks().forEach((t) => {
      t.enabled = !next
    })
  }, [cameraOff, localStream])

  return {
    remoteVideoRef,
    connection,
    muted,
    cameraOff,
    needsTap,
    startPlayback,
    toggleMute,
    toggleCamera,
  }
}
