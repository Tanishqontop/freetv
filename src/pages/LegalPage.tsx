import { Link, Navigate, useParams } from 'react-router-dom'

const PAGES = {
  terms: {
    title: 'Terms of Service',
    body: [
      'TODO: legal review. FreeTV is a free random-chat product for adults only (18+).',
      'You agree not to use FreeTV for illegal activity, harassment, scams, or sexual content involving minors.',
      'We may suspend accounts after reports. Sessions can be ended at any time by either person.',
      'Video and audio are peer-to-peer and are not recorded by FreeTV. Text messages may be stored up to 24 hours for abuse review, then deleted.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    body: [
      'TODO: legal review. We create an anonymous session so you can chat without an email.',
      'We store a random user id, age-confirmation timestamp, reports, and short-lived text messages.',
      'We do not sell personal data. WebRTC media is sent between browsers, not through our servers, except for the signaling needed to connect.',
      'Optional TURN servers (if configured) may relay encrypted media when a direct connection fails.',
    ],
  },
  guidelines: {
    title: 'Community Guidelines',
    body: [
      'Be 18 or older. There is no kids mode.',
      'No sexual content involving minors — zero tolerance, illegal, and will be banned.',
      'No doxxing, scams, malware, or unwanted sexual content.',
      'Skip or report anyone who makes you uncomfortable. Three reports in 24 hours can auto-ban an account.',
    ],
  },
} as const

export function LegalPage() {
  const { slug } = useParams()
  const page = slug && slug in PAGES ? PAGES[slug as keyof typeof PAGES] : null
  if (!page) return <Navigate to="/" replace />

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-5 py-10">
      <Link to="/" className="text-sm text-acid">
        ← FreeTV
      </Link>
      <h1 className="mt-6 font-display text-4xl font-extrabold">{page.title}</h1>
      <div className="mt-6 space-y-4 text-mute">
        {page.body.map((para) => (
          <p key={para}>{para}</p>
        ))}
      </div>
    </div>
  )
}
