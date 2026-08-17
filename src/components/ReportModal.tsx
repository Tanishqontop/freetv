import { useState, type FormEvent } from 'react'
import { REPORT_REASONS, type ReportReason } from '../lib/constants'

export function ReportModal({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean
  busy: boolean
  onClose: () => void
  onSubmit: (reason: ReportReason, details: string) => void
}) {
  const [reason, setReason] = useState<ReportReason>('harassment')
  const [details, setDetails] = useState('')

  if (!open) return null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(reason, details)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl"
      >
        <h2 className="font-display text-2xl font-bold">Report stranger</h2>
        <p className="mt-1 text-sm text-mute">
          This ends the chat. False reports can get your own account banned.
        </p>

        <fieldset className="mt-4 space-y-2">
          {REPORT_REASONS.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2 has-[:checked]:border-acid"
            >
              <input
                type="radio"
                name="reason"
                value={item.id}
                checked={reason === item.id}
                onChange={() => setReason(item.id)}
                className="mt-1 accent-[#c4f542]"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </fieldset>

        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 500))}
          placeholder="Optional details"
          rows={3}
          className="mt-4 w-full resize-none rounded-xl border border-line bg-ink px-3 py-2 outline-none focus:border-acid"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-mute hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-red-500 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {busy ? 'Sending…' : 'Report and disconnect'}
          </button>
        </div>
      </form>
    </div>
  )
}
