export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const scale = size === 'lg' ? 'text-5xl sm:text-7xl' : size === 'sm' ? 'text-xl' : 'text-3xl'

  return (
    <div className="flex items-center gap-3">
      <span className="relative grid h-10 w-10 place-items-center rounded-xl border border-acid/40 bg-panel shadow-[0_0_24px_rgba(196,245,66,0.15)]">
        <span className="block h-4 w-6 rounded-[3px] border-2 border-acid" />
        <span className="absolute bottom-1.5 h-0.5 w-4 rounded bg-acid" />
      </span>
      <span className={`font-display font-extrabold tracking-tight ${scale}`}>
        FREE<span className="text-acid">TV</span>
      </span>
    </div>
  )
}
