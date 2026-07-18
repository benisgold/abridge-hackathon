import { buildColorMap, colorForIndex } from '../lib/codeColors'
import { EXTRACTION_MODELS, type ModelId } from '../lib/models'
import type { ExtractedCode } from '../types'

type Props = {
  steps: string[]
  codes: ExtractedCode[]
  running: boolean
  /** True when these codes came from cache rather than a fresh model call. */
  cached: boolean
  started: boolean
  error: string | null
  selectedCode: string | null
  model: ModelId
  onModelChange: (model: ModelId) => void
  onRun: () => void
  onRegenerate: () => void
  onContinue: () => void
  onSelectCode: (code: string | null) => void
}

export function ExtractionProgress({
  steps,
  codes,
  running,
  cached,
  started,
  error,
  selectedCode,
  model,
  onModelChange,
  onRun,
  onRegenerate,
  onContinue,
  onSelectCode,
}: Props) {
  const idle = !started && !running && codes.length === 0 && !error
  const colorSlots = buildColorMap(codes)

  return (
    <div className="flex flex-col rounded border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-2.5 w-2.5 rounded-full ${
              running ? 'animate-pulse bg-teal-600' : 'bg-slate-300'
            }`}
          />
          <div>
            <h2 className="text-lg font-medium text-slate-900">
              {running ? 'Reviewing your summary…' : 'Follow-up procedures'}
            </h2>
            {cached && !running && (
              <p className="mt-0.5 text-sm text-slate-500">
                Showing your saved results — no need to run this again.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <span className="hidden sm:inline">Model</span>
            <select
              value={model}
              disabled={running}
              onChange={(e) => onModelChange(e.target.value as ModelId)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none disabled:opacity-60"
            >
              {EXTRACTION_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.blurb}
                </option>
              ))}
            </select>
          </label>

          {codes.length > 0 && !running && (
            <button
              type="button"
              onClick={onRegenerate}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ↻ Regenerate
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        {idle && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
            <p className="max-w-xs text-slate-600">
              We'll read your summary and find the procedures your care team
              recommended, along with what they cost.
            </p>
            <button
              type="button"
              onClick={onRun}
              className="rounded bg-teal-700 px-6 py-3 font-medium tracking-wide text-white uppercase hover:bg-teal-800"
            >
              Find follow-up costs
            </button>
          </div>
        )}

        {steps.length > 0 && (
          <ol className="space-y-2">
            {steps.map((step, index) => {
              // The last step stays "active" until the stream finishes.
              const active = running && index === steps.length - 1
              return (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                      active
                        ? 'animate-pulse bg-teal-100 text-teal-700'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {active ? '•' : '✓'}
                  </span>
                  <span className={active ? 'text-slate-900' : 'text-slate-600'}>
                    {step}
                  </span>
                </li>
              )
            })}
          </ol>
        )}

        {codes.length > 0 && (
          <div className={steps.length > 0 ? 'mt-5' : ''}>
            <p className="text-sm font-medium text-slate-700">
              Billing codes found ({codes.length})
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Each code is colour-matched to the line it came from. Click one to
              highlight that line.
            </p>
            <ul className="mt-3 space-y-2">
              {codes.map((code) => {
                // Slot is keyed by source line, so codes from the same line
                // share a colour with each other and with that line.
                const color = colorForIndex(colorSlots.get(code.code) ?? 0)
                const selected = code.code === selectedCode
                const traced = code.line !== null && code.line !== undefined
                return (
                  <li key={code.code}>
                    <button
                      type="button"
                      onClick={() => onSelectCode(selected ? null : code.code)}
                      aria-pressed={selected}
                      data-code={code.code}
                      data-selected={selected ? 'true' : 'false'}
                      className={`w-full rounded border p-4 text-left transition ${
                        selected
                          ? 'border-slate-400 bg-white ring-2 ring-slate-400'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-sm font-semibold ${color.badge}`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${color.dot}`}
                          />
                          {code.code}
                        </span>
                        <span className="font-medium text-slate-900">
                          {code.name}
                        </span>
                      </div>
                      {code.rationale && (
                        <p className="mt-1.5 text-sm text-slate-600">
                          {traced ? 'From: ' : 'Reason: '}
                          <span className="italic">“{code.rationale}”</span>
                        </p>
                      )}
                      {!traced && (
                        <p className="mt-1 text-xs text-slate-500">
                          Couldn't be traced to a specific line.
                        </p>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {error && (
          <div className="mt-5 rounded border border-red-300 bg-red-50 px-4 py-3">
            <p className="text-red-800">{error}</p>
            <button
              type="button"
              onClick={onRegenerate}
              className="mt-2 text-sm font-medium text-red-900 underline"
            >
              Try again
            </button>
          </div>
        )}

        {!running && !error && started && codes.length === 0 && (
          <p className="py-6 text-center text-slate-600">
            No billable follow-up procedures found in this summary.
          </p>
        )}

        {codes.length > 0 && !running && (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onContinue}
              className="rounded bg-teal-700 px-6 py-3 font-medium tracking-wide text-white uppercase hover:bg-teal-800"
            >
              See estimated costs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
