import { formatUSD } from '../lib/format'
import type { CodePricing, PriceSource, PricingResponse } from '../types'

type Props = {
  pricing: PricingResponse
  selectedCodes: Set<string>
  onToggle: (code: string) => void
  onContinue: () => void
}

/** Circled "i" carrying its one-liner in a tooltip. */
function InfoIcon({ label }: { label: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-slate-400 align-middle text-[9px] font-bold text-white"
    >
      i
    </span>
  )
}

/**
 * How many hospitals publish a price, since 1 is much weaker than 3. On hover
 * it reveals every publishing hospital and its price — including hospitals that
 * publish a price but aren't shown on the map (flagged shown=false), which is
 * why the count here can exceed the number of pins.
 */
function SourcesCell({ sources }: { sources: PriceSource[] }) {
  const count = sources.length
  const hiddenCount = sources.filter((s) => !s.shown).length
  const label = count === 1 ? '1 hospital' : `${count} hospitals`

  return (
    <div className="group relative inline-block">
      <span
        className={`cursor-help underline decoration-dotted underline-offset-2 ${
          count <= 1 ? 'text-amber-700' : 'text-slate-600'
        }`}
      >
        {label}
      </span>

      <div className="pointer-events-none absolute top-full right-0 z-20 mt-1 hidden w-72 rounded border border-slate-200 bg-white p-3 text-left whitespace-normal shadow-lg group-hover:block">
        <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
          Published by
        </p>
        <ul className="space-y-1.5">
          {sources.map((s) => (
            <li
              key={s.hospital_id}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="min-w-0 flex-1 break-words text-slate-700">
                {s.hospital_name}
                {!s.shown && (
                  <span className="mt-0.5 block text-xs text-slate-400">
                    not shown on map
                  </span>
                )}
              </span>
              <span className="shrink-0 font-medium whitespace-nowrap text-slate-900">
                {formatUSD(s.amount)}
                {s.basis === 'negotiated' && (
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    neg.
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {hiddenCount > 0 && (
          <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
            {hiddenCount} publishes a price but isn't shown on the map (adult
            patients aren't quoted paediatric-hospital prices).
          </p>
        )}
      </div>
    </div>
  )
}

/** The p10–p90 band, or a "limited data" note when there's essentially one plan. */
function ExpectedRangeCell({ item }: { item: CodePricing }) {
  const hasBand = item.expected_low !== null && item.expected_high !== null
  return (
    <div className="text-right">
      {item.limited_data ? (
        <span className="text-slate-400">Limited data</span>
      ) : hasBand ? (
        <span className="whitespace-nowrap text-slate-900">
          {formatUSD(item.expected_low!)}
          {item.expected_median !== null &&
            ` – ${formatUSD(item.expected_median)}`}{' '}
          – {formatUSD(item.expected_high!)}
        </span>
      ) : (
        <span className="text-slate-400">—</span>
      )}
      {!item.limited_data && item.n_payers > 0 && (
        <p className="mt-0.5 text-xs text-slate-400">
          based on {item.n_payers} {item.n_payers === 1 ? 'plan' : 'plans'}
        </p>
      )}
    </div>
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
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
  const totalWithout = sum(selected.map((c) => c.without_insurance ?? 0))
  const totalWith = sum(selected.map((c) => c.with_insurance ?? 0))
  const bandSelected = selected.filter(
    (c) => !c.limited_data && c.expected_low !== null && c.expected_high !== null,
  )
  const totalLow = sum(bandSelected.map((c) => c.expected_low!))
  const totalHigh = sum(bandSelected.map((c) => c.expected_high!))

  return (
    <div className="rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-medium text-slate-900">
          Your estimated follow-up costs
        </h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Real prices published by Boston-area hospitals under CMS
          price-transparency rules. Click a row to include or exclude it from
          your total.
        </p>
      </div>

      <div className="overflow-x-auto md:overflow-x-visible">
        <table className="w-full min-w-[56rem] text-left">
          <thead>
            <tr className="border-b border-slate-200 text-sm text-slate-600">
              <th className="px-6 py-3 font-medium">Include</th>
              <th className="px-3 py-3 font-medium">Code</th>
              <th className="px-3 py-3 font-medium">Procedure</th>
              <th className="px-3 py-3 text-right font-medium">
                Without insurance
                <InfoIcon label="What you pay if you self-pay." />
              </th>
              <th className="px-3 py-3 text-right font-medium">
                With your insurance
                <InfoIcon label="What your plan agreed to pay here." />
              </th>
              <th className="px-3 py-3 text-right font-medium">
                Expected range
                <InfoIcon label="What people actually paid, most landing in this band." />
              </th>
              <th className="px-6 py-3 font-medium">Published by</th>
            </tr>
          </thead>
          <tbody>
            {pricing.codes.map((item) => {
              const code = item.procedure.code
              const included = selectedCodes.has(code)
              const dim = included ? '' : 'opacity-60'
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
                    className={`px-3 py-4 text-right whitespace-nowrap text-slate-900 ${dim}`}
                  >
                    {item.without_insurance !== null ? (
                      formatUSD(item.without_insurance)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-4 text-right whitespace-nowrap text-slate-900 ${dim}`}
                  >
                    {item.with_insurance !== null ? (
                      formatUSD(item.with_insurance)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className={`px-3 py-4 text-sm ${dim}`}>
                    <ExpectedRangeCell item={item} />
                  </td>
                  <td className="px-6 py-4 text-sm whitespace-nowrap">
                    <SourcesCell sources={item.sources} />
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
                {formatUSD(totalWithout)}
              </td>
              <td className="px-3 py-4 text-right whitespace-nowrap text-slate-900">
                {formatUSD(totalWith)}
              </td>
              <td className="px-3 py-4 text-right whitespace-nowrap text-slate-900">
                {bandSelected.length > 0 ? (
                  `${formatUSD(totalLow)} – ${formatUSD(totalHigh)}`
                ) : (
                  <span className="text-slate-400">—</span>
                )}
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
