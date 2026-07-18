import { formatUSD } from '../lib/format'
import type { HospitalEstimate } from '../types'

type Props = {
  results: HospitalEstimate[]
  selectedId: string | null
  onSelect: (hospitalId: string) => void
}

export function HospitalList({ results, selectedId, onSelect }: Props) {
  const cheapest = results[0]?.breakdown.patient_responsibility

  return (
    <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pr-1">
      {results.map((result) => {
        const selected = result.hospital.id === selectedId
        return (
          <li key={result.hospital.id}>
            <button
              type="button"
              onClick={() => onSelect(result.hospital.id)}
              aria-pressed={selected}
              data-hospital={result.hospital.id}
              className={`w-full rounded border p-4 text-left transition ${
                selected
                  ? 'border-teal-700 bg-teal-50 ring-2 ring-teal-600'
                  : 'border-slate-200 bg-white hover:border-slate-400'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {result.hospital.name}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {result.hospital.city}, {result.hospital.state} ·{' '}
                    {result.distance_miles} mi
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-semibold text-emerald-600">
                    {formatUSD(result.breakdown.patient_responsibility)}
                  </p>
                  {result.breakdown.patient_responsibility === cheapest && (
                    <span className="text-xs font-medium tracking-wide text-emerald-700 uppercase">
                      Lowest
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
