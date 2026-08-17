export function OnlineBadge({
  count,
  size = 'md',
}: {
  count: number | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const label =
    count === null
      ? 'Connecting…'
      : `${count.toLocaleString()} ${count === 1 ? 'person' : 'people'} online`

  const text =
    size === 'lg'
      ? 'font-display text-xl font-semibold sm:text-2xl'
      : size === 'sm'
        ? 'text-xs text-mute'
        : 'text-sm text-mute'

  return (
    <p className={`inline-flex items-center gap-2 ${text}`} data-online={count ?? ''}>
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
        <span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-acid" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-acid" />
      </span>
      <span>{label}</span>
    </p>
  )
}
