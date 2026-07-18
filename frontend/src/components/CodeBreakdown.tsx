import { formatUSD } from '../lib/format'
import type { PricingResponse } from '../types'

type Props = {
  pricing: PricingResponse
  selectedCodes: Set<string>
  onToggle: (code: string) => void
  onContinue: () => void
}

function MedicareCell({ covered }: { covered: boolean | null }) {
  if (covered === null) {
    return (
      <span
        title="This code isn't in the demo catalog, so coverage is unknown."
        className="text-slate-500"
      >
        Unknown
      </span>
    )
  }
  return covered ? (
    <span className="text-emerald-700">✓ Covered</span>
  ) : (
    <span className="text-red-700">✗ Not covered</span>
  )
}

export function CodeBreakdown({
  pricing,
  selectedCodes,
  onToggle,
  onContinue,
}: Props) {
  const selected = pricing.codes.filter((c) =>
    selectedCodes.has(c.procedure.code),
  )
  const totalAverage = selected.reduce((sum, c) => sum + c.average, 0)
  const totalLowest = selected.reduce((sum, c) => sum + c.lowest, 0)

  return (
    <div className="rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-medium text-slate-900">
          Your estimated follow-up costs
        </h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Averages and lows across Boston-area hospitals. Click a row to include
          or exclude it from your total.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left">
          <thead>
            <tr className="border-b border-slate-200 text-sm text-slate-600">
              <th className="px-6 py-3 font-medium">Include</th>
              <th className="px-3 py-3 font-medium">Code</th>
              <th className="px-3 py-3 font-medium">Procedure</th>
              <th className="px-3 py-3 text-right font-medium">Average</th>
              <th className="px-3 py-3 text-right font-medium">Lowest</th>
              <th className="px-6 py-3 font-medium">Medicare</th>
            </tr>
          </thead>
          <tbody>
            {pricing.codes.map((item) => {
              const code = item.procedure.code
              const included = selectedCodes.has(code)
              return (
                <tr
                  key={code}
                  onClick={() => onToggle(code)}
                  className={`cursor-pointer border-b border-slate-100 transition ${
                    included ? 'hover:bg-slate-50' : 'bg-slate-50/60 opacity-60'
                  }`}
                >
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={() => onToggle(code)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Include ${item.procedure.name}`}
                      className="h-4 w-4 accent-teal-700"
                    />
                  </td>
                  <td className="px-3 py-4 font-mono text-sm text-slate-700">
                    {code}
                  </td>
                  <td className="px-3 py-4">
                    <p className="font-medium text-slate-900">
                      {item.procedure.name}
                    </p>
                    <p className="mt-0.5 max-w-md text-sm text-slate-600">
                      {item.procedure.description}
                    </p>
                  </td>
                  <td
                    className={`px-3 py-4 text-right whitespace-nowrap text-slate-900 ${
                      included ? '' : 'line-through'
                    }`}
                  >
                    {formatUSD(item.average)}
                  </td>
                  <td
                    className={`px-3 py-4 text-right font-medium whitespace-nowrap text-emerald-700 ${
                      included ? '' : 'line-through'
                    }`}
                  >
                    {formatUSD(item.lowest)}
                  </td>
                  <td className="px-6 py-4 text-sm whitespace-nowrap">
                    <MedicareCell covered={item.procedure.medicare_covered} />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-medium">
              <td colSpan={3} className="px-6 py-4 text-slate-900">
                Total for {selected.length} of {pricing.codes.length}{' '}
                {pricing.codes.length === 1 ? 'procedure' : 'procedures'}
              </td>
              <td className="px-3 py-4 text-right whitespace-nowrap text-slate-900">
                {formatUSD(totalAverage)}
              </td>
              <td className="px-3 py-4 text-right whitespace-nowrap text-emerald-700">
                {formatUSD(totalLowest)}
              </td>
              <td className="px-6 py-4" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end border-t border-slate-200 px-6 py-4">
        <button
          type="button"
          onClick={onContinue}
          disabled={selected.length === 0}
          className="rounded bg-teal-700 px-6 py-3 font-medium tracking-wide text-white uppercase hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          Find hospitals near me
        </button>
      </div>
    </div>
  )
}
