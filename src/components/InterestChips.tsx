import { INTERESTS, type Interest } from '../lib/constants'

export function InterestChips({
  selected,
  onChange,
}: {
  selected: Interest[]
  onChange: (next: Interest[]) => void
}) {
  function toggle(tag: Interest) {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag))
      return
    }
    if (selected.length >= 5) return
    onChange([...selected, tag])
  }

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {INTERESTS.map((tag) => {
        const on = selected.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={`rounded-full border px-3 py-1.5 text-sm capitalize transition ${
              on
                ? 'border-acid bg-acid text-ink'
                : 'border-line bg-panel text-mute hover:border-acid/50 hover:text-white'
            }`}
          >
            {tag}
          </button>
        )
      })}
    </div>
  )
}
