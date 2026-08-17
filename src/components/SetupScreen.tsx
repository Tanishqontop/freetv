import { Logo } from './Logo'

export function SetupScreen() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-white">
      <div className="grain pointer-events-none absolute inset-0 opacity-20" />
      <div className="relative mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
        <Logo />
        <h1 className="mt-8 font-display text-4xl font-extrabold">Connect Supabase</h1>
        <p className="mt-3 text-mute">
          The app is built. Add your project URL and anon key to{' '}
          <code className="text-acid">.env.local</code>, then restart the dev server.
        </p>
        <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-mute">
          <li>Create a project at supabase.com</li>
          <li>Enable Anonymous sign-ins (Authentication → Providers)</li>
          <li>
            Run <code className="text-acid">supabase/migrations/20260817100000_init.sql</code> in
            the SQL editor
          </li>
          <li>
            Copy URL + anon key into <code className="text-acid">.env.local</code>
          </li>
        </ol>
      </div>
    </div>
  )
}
