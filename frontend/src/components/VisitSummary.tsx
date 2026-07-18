import { useEffect, useRef } from 'react'
import { buildColorMap, colorForIndex } from '../lib/codeColors'
import type { Encounter, EncounterSummary, ExtractedCode } from '../types'

/** Above this many codes on one line, show a count instead of every badge. */
const MAX_INLINE_BADGES = 4

type Props = {
  encounters: EncounterSummary[]
  selectedId: string
  encounter: Encounter | null
  summaryText: string
  codes: ExtractedCode[]
  selectedCode: string | null
  onSelectEncounter: (id: string) => void
  onSelectCode: (code: string | null) => void
}

/**
 * Left panel: the note as uploaded, with each line that produced a billing
 * code marked inline and colour-paired to its card.
 */
export function VisitSummary({
  encounters,
  selectedId,
  encounter,
  summaryText,
  codes,
  selectedCode,
  onSelectEncounter,
  onSelectCode,
}: Props) {
  const lines = summaryText.split('\n')
  const activeLineRef = useRef<HTMLDivElement>(null)
  const colorSlots = buildColorMap(codes)

  // Codes grouped by the line they came from; a line can produce several.
  const byLine = new Map<number, ExtractedCode[]>()
  for (const code of codes) {
    if (code.line === null || code.line === undefined) continue
    byLine.set(code.line, [...(byLine.get(code.line) ?? []), code])
  }

  const selectedLine = codes.find((c) => c.code === selectedCode)?.line ?? null

  useEffect(() => {
    if (selectedLine === null) return
    activeLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [selectedLine])

  const unmapped = codes.filter((c) => c.line === null || c.line === undefined)

  return (
    <div className="flex flex-col rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-medium text-slate-900">
          After-visit summary
        </h2>
        <p className="mt-0.5 text-sm text-slate-600">
          {encounter
            ? `${encounter.visit_title} · ${encounter.date}`
            : 'Loading encounter…'}
        </p>

        <label className="mt-3 flex flex-col gap-1">
          <span className="text-sm text-slate-600">Encounter</span>
          <select
            value={selectedId}
            onChange={(e) => onSelectEncounter(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
          >
            {encounters.map((e) => (
              <option key={e.id} value={e.id}>
                {e.has_codes ? '' : '(no priced follow-ups) '}
                {e.patient_name} — {e.visit_title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="mb-2 text-sm text-slate-600">
          {codes.length > 0
            ? 'Highlighted lines produced a billing code. Click a line or a code to link them.'
            : 'Uploaded by your care team.'}
        </p>
        <div
          data-testid="summary-lines"
          className="min-h-[26rem] flex-1 overflow-y-auto rounded border border-slate-300 bg-slate-50 p-3 font-mono text-sm leading-relaxed"
        >
          {lines.map((line, lineIndex) => {
            const hits = byLine.get(lineIndex) ?? []
            const isSelected = hits.some((h) => h.code === selectedCode)
            // Every code on this line shares its slot, so hits[0] is safe.
            const color =
              hits.length > 0
                ? colorForIndex(colorSlots.get(hits[0].code) ?? 0)
                : null

            if (hits.length === 0) {
              return (
                <div
                  key={lineIndex}
                  data-line={lineIndex}
                  className="px-2 py-0.5 whitespace-pre-wrap text-slate-700"
                >
                  {line || ' '}
                </div>
              )
            }

            return (
              <div
                key={lineIndex}
                ref={isSelected ? activeLineRef : undefined}
                data-line={lineIndex}
                data-has-code="true"
                data-selected={isSelected ? 'true' : 'false'}
                onClick={() => onSelectCode(isSelected ? null : hits[0].code)}
                className={`cursor-pointer rounded px-2 py-1 whitespace-pre-wrap text-slate-900 transition ${
                  isSelected ? color!.lineActive : color!.lineIdle
                }`}
              >
                <span>{line || ' '}</span>
                {/*
                  A panel line can yield 15+ codes. Listing them all turns the
                  note into a wall of badges, so past a handful we collapse to
                  a count — the codes themselves are in the right-hand panel.
                */}
                <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                  {hits.length > MAX_INLINE_BADGES ? (
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-xs font-semibold ${
                        colorForIndex(colorSlots.get(hits[0].code) ?? 0).badge
                      }`}
                    >
                      {hits.length} codes
                    </span>
                  ) : (
                    hits.map((hit) => (
                      <span
                        key={hit.code}
                        className={`inline-block rounded border px-1.5 py-0.5 text-xs font-semibold ${
                          colorForIndex(colorSlots.get(hit.code) ?? 0).badge
                        }`}
                      >
                        {hit.code}
                      </span>
                    ))
                  )}
                </span>
              </div>
            )
          })}
        </div>

        {unmapped.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {unmapped.map((c) => c.code).join(', ')} couldn't be traced to a
            specific line.
          </p>
        )}
      </div>
    </div>
  )
}
