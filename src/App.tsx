import { Navigate, Route, Routes } from 'react-router-dom'
import { BannedScreen } from './components/BannedScreen'
import { SetupScreen } from './components/SetupScreen'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { isSupabaseConfigured } from './lib/supabase'
import { ChatPage } from './pages/ChatPage'
import { HomePage } from './pages/HomePage'
import { LegalPage } from './pages/LegalPage'
import { VideoPage } from './pages/VideoPage'

function Gate() {
  const { loading, profile } = useAuth()

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="text-mute">Loading FreeTV…</p>
      </div>
    )
  }

  if (profile?.is_banned) {
    return <BannedScreen reason={profile.ban_reason} />
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/video" element={<VideoPage />} />
      <Route path="/legal/:slug" element={<LegalPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupScreen />

  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
