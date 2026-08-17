import { useCallback, useEffect, useRef, useState } from 'react'
import { getIceServers } from '../lib/iceServers'
import { requireSupabase } from '../lib/supabase'
import type { WebRtcRole } from '../lib/types'

type Options = {
  sessionId: string | null
  role: WebRtcRole | null
  enabled: boolean
  localStream: MediaStream | null
}

function sdpPayload(desc: RTCSessionDescription | RTCSessionDescriptionInit) {
  return { type: desc.type, sdp: desc.sdp }
}

export function useWebRTC({ sessionId, role, enabled, localStream }: Options) {
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
    if (!enabled || !sessionId || !role || !localStream) return

    const stream = localStream
    if (!stream) return

    const client = requireSupabase()
    let closed = false
    let retry: number | undefined
    let dyingChannel: ReturnType<typeof client.channel> | null = null
    let dyingPc: RTCPeerConnection | null = null

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
          for (const track of incoming.getTracks()) {
            if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
              remoteStream.addTrack(track)
            }
          }
        } else if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
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

      const channel = client.channel(`webrtc:${sessionId}`, {
        config: { broadcast: { ack: true, self: false } },
      })
      dyingChannel = channel

      const send = (event: string, payload: unknown) => {
        void channel.send({ type: 'broadcast', event, payload })
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) send('ice', event.candidate.toJSON())
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

      channel
        .on('broadcast', { event: 'ready' }, ({ payload }) => {
          if (role === 'caller' && payload?.role === 'callee') void makeOffer()
        })
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          if (role !== 'callee' || closed || !payload?.sdp) return
          gotOffer = true
          await pc.setRemoteDescription(new RTCSessionDescription(payload))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          send('answer', sdpPayload(pc.localDescription ?? answer))
          for (const ice of pendingIce) {
            await pc.addIceCandidate(ice)
          }
          pendingIce.length = 0
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          if (role !== 'caller' || closed || !payload?.sdp) return
          gotAnswer = true
          await pc.setRemoteDescription(new RTCSessionDescription(payload))
          for (const ice of pendingIce) {
            await pc.addIceCandidate(ice)
          }
          pendingIce.length = 0
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          if (!payload) return
          if (!pc.remoteDescription) {
            pendingIce.push(payload)
            return
          }
          try {
            await pc.addIceCandidate(payload)
          } catch {
            /* ignore stale ICE */
          }
        })
        .on('broadcast', { event: 'hangup' }, () => {
          if (!closed) setConnection('failed')
        })

      void channel.subscribe(async (status) => {
        if (status !== 'SUBSCRIBED' || closed) return
        setConnection('connecting')
        send('ready', { role })
      })

      retry = window.setInterval(() => {
        if (closed) return
        if (role === 'callee' && !gotOffer) send('ready', { role })
        if (role === 'caller' && !gotAnswer) void makeOffer()
      }, 1200)
    }

    void start()

    return () => {
      closed = true
      if (retry) window.clearInterval(retry)
      const channel = dyingChannel
      const pc = dyingPc
      window.setTimeout(() => {
        if (channel) void client.removeChannel(channel)
        pc?.close()
      }, 400)
    }
  }, [attachRemote, enabled, localStream, role, sessionId])

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
