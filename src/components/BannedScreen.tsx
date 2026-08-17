import { Link } from 'react-router-dom'

export function BannedScreen({ reason }: { reason: string | null }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-md">
        <p className="font-display text-4xl font-extrabold">Account blocked</p>
        <p className="mt-3 text-mute">
          {reason ?? 'This account can no longer use FreeTV.'}
        </p>
        <Link to="/" className="mt-6 inline-block text-acid underline">
          Back home
        </Link>
      </div>
    </div>
  )
}
