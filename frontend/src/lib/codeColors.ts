/**
 * Colour pairs linking a code card to its source line.
 *
 * Colour is a secondary cue only — every marker also carries the CPT number, so
 * the correspondence survives colour-blindness and greyscale printing.
 */
export type CodeColor = {
  /** Card accent + inline marker. */
  badge: string
  /** Source line background when the code is selected. */
  lineActive: string
  /** Source line background when a code merely points at it. */
  lineIdle: string
  dot: string
}

const PALETTE: CodeColor[] = [
  {
    badge: 'bg-teal-100 text-teal-900 border-teal-300',
    lineActive: 'bg-teal-100 ring-2 ring-teal-500',
    lineIdle: 'bg-teal-50',
    dot: 'bg-teal-600',
  },
  {
    badge: 'bg-violet-100 text-violet-900 border-violet-300',
    lineActive: 'bg-violet-100 ring-2 ring-violet-500',
    lineIdle: 'bg-violet-50',
    dot: 'bg-violet-600',
  },
  {
    badge: 'bg-amber-100 text-amber-900 border-amber-300',
    lineActive: 'bg-amber-100 ring-2 ring-amber-500',
    lineIdle: 'bg-amber-50',
    dot: 'bg-amber-600',
  },
  {
    badge: 'bg-sky-100 text-sky-900 border-sky-300',
    lineActive: 'bg-sky-100 ring-2 ring-sky-500',
    lineIdle: 'bg-sky-50',
    dot: 'bg-sky-600',
  },
  {
    badge: 'bg-rose-100 text-rose-900 border-rose-300',
    lineActive: 'bg-rose-100 ring-2 ring-rose-500',
    lineIdle: 'bg-rose-50',
    dot: 'bg-rose-600',
  },
  {
    badge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    lineActive: 'bg-emerald-100 ring-2 ring-emerald-500',
    lineIdle: 'bg-emerald-50',
    dot: 'bg-emerald-600',
  },
]

export function colorForIndex(index: number): CodeColor {
  return PALETTE[index % PALETTE.length]
}

/**
 * Maps each code to a palette slot keyed by its *source line*, so codes drawn
 * from the same line share a colour.
 *
 * Colouring per-card instead would break the pairing whenever one line yields
 * several codes: the line can only carry one background, so the other cards
 * would advertise a colour that appears nowhere in the note.
 */
export function buildColorMap(
  codes: { code: string; line: number | null }[],
): Map<string, number> {
  const slotForLine = new Map<number, number>()
  const slotForCode = new Map<string, number>()
  let next = 0

  for (const { code, line } of codes) {
    if (line === null || line === undefined) {
      // Untraced codes get their own slot; they have no line to pair with.
      slotForCode.set(code, next++)
      continue
    }
    if (!slotForLine.has(line)) slotForLine.set(line, next++)
    slotForCode.set(code, slotForLine.get(line)!)
  }
  return slotForCode
}
