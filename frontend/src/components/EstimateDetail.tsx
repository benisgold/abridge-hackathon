import { formatDate, formatUSD } from '../lib/format'
import type { EstimateResponse, HospitalEstimate } from '../types'

type Props = {
  procedures: EstimateResponse['procedures']
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

function RangeBar({ low, high, value }: { low: number; high: number; value: number }) {
  const span = high - low
  const percent = span > 0 ? ((value - low) / span) * 100 : 50

  return (
    <div className="px-8 pt-2 pb-1">
      <p
        className="mb-1 text-center text-lg font-semibold text-emerald-600"
        style={{ marginLeft: `${percent - 50}%` }}
      >
        {formatUSD(value)}
      </p>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm text-slate-700">{formatUSD(low)}</span>
        <div className="relative h-px flex-1 bg-slate-800">
          <span className="absolute -top-[3px] -left-[3px] h-[7px] w-[7px] rounded-full bg-slate-900" />
          <span className="absolute -top-[3px] -right-[3px] h-[7px] w-[7px] rounded-full bg-slate-900" />
          <span
            className="absolute -top-[5px] h-[11px] w-[11px] -translate-x-1/2 rounded-full border-2 border-white bg-emerald-600"
            style={{ left: `${percent}%` }}
          />
        </div>
        <span className="shrink-0 text-sm text-slate-700">{formatUSD(high)}</span>
      </div>
      <div className="flex justify-between px-6 text-sm text-slate-600">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  )
}

export function EstimateDetail({
  procedures,
  estimate,
  createdDate,
  validDays,
}: Props) {
  const { hospital, breakdown, line_items: lineItems } = estimate

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
          {procedures.length}{' '}
          {procedures.length === 1 ? 'procedure' : 'procedures'}
        </p>
        <p className="font-bold text-slate-900">
          CPT® {procedures.map((p) => p.code).join(', ')}
        </p>
        <ul className="mt-2 space-y-1">
          {procedures.map((p) => (
            <li key={p.code} className="text-slate-700">
              <span className="font-medium">{p.name}</span> — {p.description}
            </li>
          ))}
        </ul>
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
            Estimated Patient Responsibility
          </p>
          <p className="mt-4 text-6xl font-semibold text-emerald-600">
            {formatUSD(breakdown.patient_responsibility)}
          </p>

          <dl className="mt-8">
            <div className="flex justify-between border-b border-slate-200 py-3">
              <dt className="text-slate-700">
                Subtotal
                <InfoIcon label="Total fees before any discount is applied" />
              </dt>
              <dd className="text-slate-900">{formatUSD(breakdown.total_fees)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-slate-700">
                Discount
                <InfoIcon label="Self-pay discount offered by this hospital" />
              </dt>
              <dd className="text-slate-900">
                -{formatUSD(breakdown.discount)}
              </dd>
            </div>
          </dl>

          <p className="mt-2 text-slate-700">
            Reference #: {breakdown.reference_number}
          </p>
          <p className="mt-2 text-sm text-slate-600 italic">
            Created {formatDate(createdDate)}, valid for {validDays} days
          </p>
        </div>

        {/* Right: itemization */}
        <div className="border border-slate-200 p-5">
          <p className="font-medium text-slate-800">Details:</p>

          <RangeBar
            low={breakdown.low}
            high={breakdown.high}
            value={breakdown.total_fees}
          />

          <dl className="mt-4">
            {lineItems.length > 1 && (
              <>
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
                      {formatUSD(item.total_fees)}
                    </dd>
                  </div>
                ))}
                <div className="mt-2 border-t border-slate-200" />
              </>
            )}
            <div className="flex justify-between pt-3">
              <dt className="text-slate-700">
                Total Fees
                <InfoIcon label="Facility and physician fees before discount" />
              </dt>
              <dd className="text-slate-900">{formatUSD(breakdown.total_fees)}</dd>
            </div>
            <div className="flex justify-between py-1 pl-6">
              <dt className="text-slate-700">Hospital fees</dt>
              <dd className="text-slate-900">
                {formatUSD(breakdown.hospital_fees)}
              </dd>
            </div>
            <div className="flex justify-between border-b border-slate-200 py-1 pb-3 pl-6">
              <dt className="text-slate-700">Physician fees</dt>
              <dd className="text-slate-900">
                {formatUSD(breakdown.physician_fees)}
              </dd>
            </div>
            <div className="flex justify-between border-b border-slate-200 py-3">
              <dt className="text-slate-700">
                Discount
                <InfoIcon label="Self-pay discount offered by this hospital" />
              </dt>
              <dd className="text-slate-900">
                -{formatUSD(breakdown.discount)}
              </dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="font-medium text-emerald-700">
                Estimated Patient Responsibility
                <InfoIcon label="What you would pay out of pocket after the discount" />
              </dt>
              <dd className="font-medium text-emerald-700">
                {formatUSD(breakdown.patient_responsibility)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-5 border border-slate-200 p-5">
        <p className="font-medium text-slate-800">Coverage Information</p>
        <p className="mt-3 flex items-center gap-2 text-lg text-slate-900">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
            ✓
          </span>
          Not using insurance (self-pay)
        </p>
        <p className="mt-3 text-slate-700">
          This estimate shows what you would pay out-of-pocket without insurance.
        </p>
        <button
          type="button"
          disabled
          title="Insurance is not wired up in this demo — every estimate is self-pay."
          className="mt-4 cursor-not-allowed bg-teal-700/50 px-6 py-3 font-medium tracking-wider text-white uppercase"
        >
          Add Insurance
        </button>
      </div>
    </section>
  )
}
