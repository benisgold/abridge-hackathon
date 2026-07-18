import { useState } from 'react'

type Props = {
  procedureCount: number
  loading: boolean
  /** Results already on screen — the button then only applies location edits. */
  hasResults: boolean
  onSearch: (zip: string, radiusMiles: number) => void
}

const RADIUS_OPTIONS = [5, 10, 25, 50]

/**
 * Location inputs only. The procedure selection lives in ProcedurePicker and
 * applies immediately, so this button exists solely to apply ZIP/radius edits.
 */
export function SearchForm({
  procedureCount,
  loading,
  hasResults,
  onSearch,
}: Props) {
  const [zip, setZip] = useState('02114')
  const [radiusMiles, setRadiusMiles] = useState(25)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    onSearch(zip.trim(), radiusMiles)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_1fr_auto]"
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">ZIP code</span>
        <input
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          required
          inputMode="numeric"
          pattern="\d{5}"
          maxLength={5}
          placeholder="02114"
          className="rounded border border-slate-300 px-3 py-2 text-slate-900 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">
          Within (miles)
        </span>
        <select
          value={radiusMiles}
          onChange={(e) => setRadiusMiles(Number(e.target.value))}
          className="rounded border border-slate-300 px-3 py-2 text-slate-900 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
        >
          {RADIUS_OPTIONS.map((miles) => (
            <option key={miles} value={miles}>
              {miles} mi
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="rounded bg-teal-700 px-6 py-2 font-medium tracking-wide text-white uppercase hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {loading
          ? 'Searching…'
          : hasResults
            ? 'Update location'
            : `Compare ${procedureCount} ${procedureCount === 1 ? 'procedure' : 'procedures'}`}
      </button>
    </form>
  )
}
