import { formatUSD } from '../lib/format'
import type { CodePricing } from '../types'

type Props = {
  codes: CodePricing[]
  selected: Set<string>
  onToggle: (code: string) => void
  onSelectAll: () => void
  onClear: () => void
}

/**
 * Procedure selection for the hospital comparison.
 *
 * Deliberately independent of the selection on the cost screen: that one
 * answers "what will all this cost me", this one answers "which of these am I
 * having done here" — and patients routinely split procedures across
 * facilities.
 */
export function ProcedurePicker({
  codes,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: Props) {
  const allSelected = selected.size === codes.length

  return (
    <div className="rounded border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium text-slate-900">
            Which procedures are you comparing?
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Costs update as you change the selection — you don't have to have
            everything done at the same place.
          </p>
        </div>
        <button
          type="button"
          onClick={allSelected ? onClear : onSelectAll}
          className="text-sm font-medium text-teal-700 hover:underline"
        >
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>

      <ul className="mt-4 flex flex-wrap gap-2">
        {codes.map((item) => {
          const code = item.procedure.code
          const isOn = selected.has(code)
          return (
            <li key={code}>
              <button
                type="button"
                onClick={() => onToggle(code)}
                aria-pressed={isOn}
                data-procedure={code}
                data-selected={isOn ? 'true' : 'false'}
                className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                  isOn
                    ? 'border-teal-700 bg-teal-50 text-teal-900'
                    : 'border-slate-300 bg-white text-slate-500 hover:border-slate-400'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                    isOn
                      ? 'bg-teal-700 text-white'
                      : 'border border-slate-300 bg-white'
                  }`}
                >
                  {isOn ? '✓' : ''}
                </span>
                <span className="font-mono text-xs">{code}</span>
                <span className={isOn ? 'text-slate-900' : ''}>
                  {item.procedure.name}
                </span>
                <span className="text-xs text-slate-500">
                  from {formatUSD(item.lowest)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
