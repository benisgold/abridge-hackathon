import { formatDate, formatUSD } from '../lib/format'
import type { HospitalEstimate } from '../types'

type Props = {
  // The basket comes from line_items, not the request: a hospital only
  // itemises the procedures it actually publishes a price for.
  estimate: HospitalEstimate
  createdDate: string
  validDays: number
}

/** Circled "i" carrying its explanation in a tooltip, as in the source design. */
function InfoIcon({ label }: { label: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-500 align-middle text-[10px] font-bold text-white"
    >
      i
    </span>
  )
}

/**
 * Visualises the p10–p90 band with the p50 (median) marked, plus where the
 * headline "you pay" figure lands within it.
 */
function RangeBar({
  low,
  median,
  high,
  value,
}: {
  low: number
  median: number | null
  high: number
  value: number
}) {
  const span = high - low
  const pct = (v: number) =>
    span > 0 ? ((Math.min(Math.max(v, low), high) - low) / span) * 100 : 50

  return (
    <div className="px-2 pt-2 pb-1">
      <div className="relative mx-1 h-1.5 rounded-full bg-slate-200">
        {/* Shaded p10→p90 band */}
        <span className="absolute inset-y-0 left-0 right-0 rounded-full bg-teal-100" />
        {/* p50 median tick */}
        {median !== null && (
          <span
            className="absolute -top-[3px] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white bg-slate-900"
            style={{ left: `${pct(median)}%` }}
            title={`Median (p50) ${formatUSD(median)}`}
          />
        )}
        {/* Where the quoted price falls */}
        <span
          className="absolute -top-[4px] h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white bg-emerald-600 shadow"
          style={{ left: `${pct(value)}%` }}
          title={`You pay ${formatUSD(value)}`}
        />
      </div>

      <div className="mt-3 flex items-end justify-between text-sm">
        <div className="text-left">
          <div className="font-semibold text-slate-900">{formatUSD(low)}</div>
          <div className="text-xs tracking-wide text-slate-500">p10</div>
        </div>
        {median !== null && (
          <div className="max-w-[40%] text-center">
            <div className="font-semibold text-slate-900">
              {formatUSD(median)}
            </div>
            <div className="text-xs tracking-wide text-slate-500">
              what people actually paid p50
            </div>
          </div>
        )}
        <div className="text-right">
          <div className="font-semibold text-slate-900">{formatUSD(high)}</div>
          <div className="text-xs tracking-wide text-slate-500">p90</div>
        </div>
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />
        You pay {formatUSD(value)}
      </p>
    </div>
  )
}

export function EstimateDetail({
  estimate,
  createdDate,
  validDays,
}: Props) {
  const { hospital, breakdown, line_items: lineItems } = estimate
  const partial = estimate.covered_count < estimate.requested_count
  const hasBand =
    breakdown.expected_low !== null && breakdown.expected_high !== null

  return (
    <section className="border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between">
        <h2 className="text-3xl text-red-900">Your Estimate</h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="text-sm text-teal-700 hover:underline"
        >
          Print
        </button>
      </div>

      <p className="mt-3 text-slate-700">
        If you need any assistance or have questions about your estimate, please
        contact the {hospital.name} Financial Counseling Department at{' '}
        {hospital.phone}.
      </p>

      <div className="mt-5 border border-slate-200 p-5">
        <p className="font-bold text-slate-900">
          {estimate.covered_count}{' '}
          {estimate.covered_count === 1 ? 'procedure' : 'procedures'}
        </p>
        <p className="font-bold text-slate-900">
          {lineItems.map((i) => i.procedure.code).join(', ')}
        </p>
        <ul className="mt-2 space-y-1">
          {lineItems.map((item) => (
            <li key={item.procedure.code} className="text-slate-700">
              <span className="font-medium">{item.procedure.name}</span> —{' '}
              {item.procedure.description}
            </li>
          ))}
        </ul>

        {partial && (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This hospital publishes prices for {estimate.covered_count} of the{' '}
            {estimate.requested_count} procedures you selected. The total below
            covers only those.
          </p>
        )}

        <p className="mt-3 text-sm text-slate-600">
          At <span className="font-medium">{hospital.name}</span> —{' '}
          {hospital.address}, {hospital.city}, {hospital.state}{' '}
          {hospital.zip_code} · {estimate.distance_miles} mi away
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left: headline figure */}
        <div className="border border-slate-200 p-5">
          <p className="font-medium text-slate-800">
            {breakdown.basis === 'cash'
              ? 'Estimated cost without insurance'
              : 'Estimated cost (negotiated)'}
          </p>
          <p className="mt-4 text-6xl font-semibold text-emerald-600">
            {formatUSD(breakdown.patient_responsibility)}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {breakdown.limited_data
              ? 'Limited data — based on a single plan'
              : `Based on ${breakdown.n_payers} plans`}
          </p>

          {breakdown.gross !== null && (
            <dl className="mt-8">
              <div className="flex justify-between border-b border-slate-200 py-3">
                <dt className="text-slate-700">
                  List price
                  <InfoIcon label="The hospital's published gross charge, before any self-pay discount" />
                </dt>
                <dd className="text-slate-900">{formatUSD(breakdown.gross)}</dd>
              </div>
              {breakdown.discount !== null && breakdown.discount > 0 && (
                <div className="flex justify-between py-3">
                  <dt className="text-slate-700">
                    Self-pay discount
                    <InfoIcon label="List price minus the published cash price" />
                  </dt>
                  <dd className="text-slate-900">
                    -{formatUSD(breakdown.discount)}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <p className="mt-4 text-slate-700">
            Reference #: {breakdown.reference_number}
          </p>
          <p className="mt-2 text-sm text-slate-600 italic">
            Created {formatDate(createdDate)}, valid for {validDays} days
          </p>
        </div>

        {/* Right: the three published figures */}
        <div className="border border-slate-200 p-5">
          <p className="font-medium text-slate-800">Details:</p>

          {hasBand && (
            <RangeBar
              low={breakdown.expected_low!}
              median={breakdown.expected_median}
              high={breakdown.expected_high!}
              value={breakdown.patient_responsibility}
            />
          )}

          <dl className="mt-4">
            {breakdown.without_insurance !== null && (
              <div className="border-b border-slate-200 py-3">
                <div className="flex justify-between">
                  <dt className="font-medium text-slate-800">
                    Without insurance
                  </dt>
                  <dd className="font-medium text-slate-900">
                    {formatUSD(breakdown.without_insurance)}
                  </dd>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  What you pay if you self-pay.
                </p>
              </div>
            )}

            {breakdown.with_insurance !== null && (
              <div className="border-b border-slate-200 py-3">
                <div className="flex justify-between">
                  <dt className="font-medium text-slate-800">
                    With your insurance
                    <InfoIcon label="A typical (median) negotiated rate across this hospital's plans — not specific to your plan, which we don't have." />
                  </dt>
                  <dd className="font-medium text-slate-900">
                    {formatUSD(breakdown.with_insurance)}
                  </dd>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  What your plan agreed to pay here.
                </p>
              </div>
            )}

            {hasBand && (
              <div className="border-b border-slate-200 py-3">
                <div className="flex justify-between">
                  <dt className="font-medium text-slate-800">Expected range</dt>
                  <dd className="font-medium text-slate-900">
                    {formatUSD(breakdown.expected_low!)}
                    {breakdown.expected_median !== null &&
                      ` – ${formatUSD(breakdown.expected_median)}`}{' '}
                    – {formatUSD(breakdown.expected_high!)}
                  </dd>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  What people actually paid (p10
                  {breakdown.expected_median !== null && ' · p50 median'} · p90),
                  most landing in this band.
                </p>
              </div>
            )}

            {lineItems.length > 1 && (
              <div className="pt-3">
                <p className="text-sm font-medium text-slate-700">
                  By procedure
                </p>
                {lineItems.map((item) => (
                  <div
                    key={item.procedure.code}
                    className="flex justify-between gap-4 py-1"
                  >
                    <dt className="text-slate-700">
                      <span className="font-mono text-sm">
                        {item.procedure.code}
                      </span>{' '}
                      {item.procedure.name}
                    </dt>
                    <dd className="whitespace-nowrap text-slate-900">
                      {formatUSD(item.patient_responsibility)}
                    </dd>
                  </div>
                ))}
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="mt-5 border border-slate-200 p-5">
        <p className="font-medium text-slate-800">Where these numbers come from</p>
        <p className="mt-3 text-slate-700">
          {hospital.name} publishes these prices under the CMS hospital
          price-transparency rule. They are the hospital's own published figures,
          not estimates generated by this app.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Prices can change, and your final bill depends on what is actually
          performed. Confirm with the hospital before scheduling.
        </p>
      </div>
    </section>
  )
}
