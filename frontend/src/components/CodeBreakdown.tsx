import { formatUSD } from '../lib/format'
import type { PricingResponse } from '../types'

type Props = {
  pricing: PricingResponse
  selectedCodes: Set<string>
  onToggle: (code: string) => void
  onContinue: () => void
}

/** How many hospitals publish a price, since 1 is much weaker than 3. */
function SourcesCell({ count }: { count: number }) {
  if (count <= 1) {
    return (
      <span
        title="Only one hospital publishes a price for this code."
        className="text-amber-700"
      >
        1 hospital
      </span>
    )
  }
  return <span className="text-slate-600">{count} hospitals</span>
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
          Real prices published by Boston-area hospitals under CMS price-transparency rules. Click a row to include
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
              <th className="px-6 py-3 font-medium">Published by</th>
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
                    {item.procedure.needs_review && (
                      <p className="mt-1 text-xs text-amber-700">
                        Code match flagged for review
                      </p>
                    )}
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
                    <SourcesCell count={item.n_hospitals} />
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
