import { useCallback, useEffect, useRef, useState } from 'react'
import { ICE_SERVERS } from '../lib/constants'
import { requireSupabase } from '../lib/supabase'
import type { WebRtcRole } from '../lib/types'

type Options = {
  sessionId: string | null
  role: WebRtcRole | null
  enabled: boolean
  localStream: MediaStream | null
}

export function useWebRTC({ sessionId, role, enabled, localStream }: Options) {
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const [connection, setConnection] = useState<'new' | 'connecting' | 'connected' | 'failed'>('new')
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)

  const attachRemote = useCallback((stream: MediaStream) => {
    const el = remoteVideoRef.current
    if (el && el.srcObject !== stream) {
      el.srcObject = stream
    }
  }, [])

  useEffect(() => {
    if (!enabled || !sessionId || !role || !localStream) return

    const client = requireSupabase()
    let closed = false
    const pendingIce: RTCIceCandidateInit[] = []
    let offered = false

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream)
    }

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      attachRemote(stream)
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
      }
    }

    const channel = client.channel(`webrtc:${sessionId}`, {
      config: { broadcast: { ack: true, self: false } },
    })

    const send = (event: string, payload: unknown) => {
      void channel.send({ type: 'broadcast', event, payload })
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send('ice', event.candidate.toJSON())
      }
    }

    const makeOffer = async () => {
      if (closed || role !== 'caller' || offered) return
      offered = true
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      send('offer', offer)
    }

    channel
      .on('broadcast', { event: 'ready' }, () => {
        if (role === 'caller') void makeOffer()
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (role !== 'callee' || closed) return
        await pc.setRemoteDescription(new RTCSessionDescription(payload))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        send('answer', answer)
        for (const ice of pendingIce) {
          await pc.addIceCandidate(ice)
        }
        pendingIce.length = 0
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (role !== 'caller' || closed) return
        await pc.setRemoteDescription(new RTCSessionDescription(payload))
        for (const ice of pendingIce) {
          await pc.addIceCandidate(ice)
        }
        pendingIce.length = 0
      })
      .on('broadcast', { event: 'ice' }, async ({ payload }) => {
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
        setConnection('failed')
      })

    void channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED' || closed) return
      setConnection('connecting')
      send('ready', { role })
      if (role === 'caller') {
        window.setTimeout(() => {
          if (!closed) void makeOffer()
        }, 800)
      }
    })

    return () => {
      closed = true
      const dying = channel
      const dyingPc = pc
      window.setTimeout(() => {
        void dying.send({ type: 'broadcast', event: 'hangup', payload: {} })
        void client.removeChannel(dying)
        dyingPc.close()
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
    toggleMute,
    toggleCamera,
  }
}
