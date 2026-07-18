import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchEncounter,
  fetchEncounters,
  fetchEstimates,
  fetchPricing,
  streamExtraction,
} from './api'
import { CodeBreakdown } from './components/CodeBreakdown'
import { EstimateDetail } from './components/EstimateDetail'
import { ExtractionProgress } from './components/ExtractionProgress'
import { HospitalList } from './components/HospitalList'
import { HospitalMap } from './components/HospitalMap'
import { ProcedurePicker } from './components/ProcedurePicker'
import { SearchForm } from './components/SearchForm'
import { VisitSummary } from './components/VisitSummary'
import type {
  Encounter,
  EncounterSummary,
  EstimateResponse,
  ExtractedCode,
  PricingResponse,
} from './types'

type Step = 'review' | 'codes' | 'hospitals'

const STEPS: { id: Step; label: string }[] = [
  { id: 'review', label: 'Visit summary' },
  { id: 'codes', label: 'Estimated costs' },
  { id: 'hospitals', label: 'Compare hospitals' },
]

function App() {
  const [step, setStep] = useState<Step>('review')

  // Encounter selection and note text
  const [encounters, setEncounters] = useState<EncounterSummary[]>([])
  const [selectedEncounterId, setSelectedEncounterId] = useState('')
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [summaryText, setSummaryText] = useState('')

  // Extraction. `cachedFor` records the note text the codes came from: it
  // survives navigation to later steps, and is cleared when the patient
  // changes, so one patient's codes never leak into another's flow. Keyed on
  // the text rather than the encounter id so the cache stays correct if the
  // note ever becomes editable again.
  const [steps, setSteps] = useState<string[]>([])
  const [extracted, setExtracted] = useState<ExtractedCode[]>([])
  const [cachedFor, setCachedFor] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractStarted, setExtractStarted] = useState(false)
  const [servedFromCache, setServedFromCache] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  // Links the two panels: the code whose source line is emphasised.
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Pricing. `costCodes` drives the total on the cost screen only.
  const [pricing, setPricing] = useState<PricingResponse | null>(null)
  const [costCodes, setCostCodes] = useState<Set<string>>(new Set())

  // Hospitals. `hospitalCodes` is a separate selection: patients often split
  // procedures across facilities, so what you're pricing overall and what
  // you'd have done at one hospital are different questions.
  const [hospitalCodes, setHospitalCodes] = useState<Set<string>>(new Set())
  const [lastQuery, setLastQuery] = useState<{
    zip: string
    radiusMiles: number
  } | null>(null)
  const [response, setResponse] = useState<EstimateResponse | null>(null)
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  // Guards against a slow earlier request overwriting a newer result.
  const estimateRequestRef = useRef(0)

  useEffect(() => {
    fetchEncounters()
      .then((list) => {
        setEncounters(list)
        if (list.length > 0) setSelectedEncounterId(list[0].id)
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  // Switching patients drops everything derived from the previous one.
  useEffect(() => {
    if (!selectedEncounterId) return

    abortRef.current?.abort()
    setExtracted([])
    setCachedFor(null)
    setSteps([])
    setExtractStarted(false)
    setServedFromCache(false)
    setExtractError(null)
    setExtracting(false)
    setSelectedCode(null)
    setPricing(null)
    setCostCodes(new Set())
    setHospitalCodes(new Set())
    setLastQuery(null)
    setResponse(null)
    setSelectedHospitalId(null)
    setStep('review')

    fetchEncounter(selectedEncounterId)
      .then((data) => {
        setEncounter(data)
        setSummaryText(data.after_visit_summary)
      })
      .catch((err: Error) => setError(err.message))
  }, [selectedEncounterId])

  const runExtraction = useCallback(
    async (force: boolean) => {
      // Cache hit: same note, codes already in hand, not a forced regenerate.
      if (!force && extracted.length > 0 && cachedFor === summaryText) {
        setServedFromCache(true)
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setSteps([])
      setExtracted([])
      setCachedFor(null)
      setServedFromCache(false)
      setExtractError(null)
      setExtractStarted(true)
      setExtracting(true)
      setSelectedCode(null)
      // Codes are about to change; anything priced off the old set is void.
      setPricing(null)
      setCostCodes(new Set())
      setHospitalCodes(new Set())
      setLastQuery(null)
      setResponse(null)
      setSelectedHospitalId(null)

      const noteAtRunStart = summaryText

      await streamExtraction(
        { summary_text: noteAtRunStart },
        {
          onStep: (label) =>
            setSteps((prev) => (prev.includes(label) ? prev : [...prev, label])),
          // The same code can legitimately appear twice; keep the first.
          onCode: (code) =>
            setExtracted((prev) =>
              prev.some((c) => c.code === code.code) ? prev : [...prev, code],
            ),
          onDone: () => {
            setCachedFor(noteAtRunStart)
            setExtracting(false)
          },
          onError: (message) => {
            setExtractError(message)
            setExtracting(false)
          },
        },
        controller.signal,
      )
    },
    [extracted.length, cachedFor, summaryText],
  )

  async function goToPricing() {
    // Reuse the priced basket only when it covers exactly the current codes —
    // comparing counts alone would silently price the wrong set.
    const wanted = extracted.map((c) => c.code)
    const alreadyPriced =
      pricing !== null &&
      pricing.codes.length === wanted.length &&
      pricing.codes.every((c, i) => c.procedure.code === wanted[i])
    if (alreadyPriced) {
      setStep('codes')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const codes = extracted.map((c) => c.code)
      const result = await fetchPricing(codes)
      setPricing(result)
      setCostCodes(new Set(codes))
      setHospitalCodes(new Set(codes))
      setStep('codes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pricing lookup failed')
    } finally {
      setLoading(false)
    }
  }

  /** Cost-screen selection: affects the estimate total, nothing downstream. */
  function toggleCostCode(code: string) {
    setCostCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  /** Hospital-screen selection: re-ranks hospitals live via the effect below. */
  function toggleHospitalCode(code: string) {
    setHospitalCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function handleSearch(zip: string, radiusMiles: number) {
    setLastQuery({ zip, radiusMiles })
  }

  // Re-fetch whenever the location or the procedure selection changes, so
  // toggling a procedure re-ranks hospitals without a second submit.
  useEffect(() => {
    if (!lastQuery) return

    if (hospitalCodes.size === 0) {
      setResponse(null)
      setSelectedHospitalId(null)
      setError(null)
      return
    }

    const requestId = ++estimateRequestRef.current
    setLoading(true)
    fetchEstimates([...hospitalCodes], lastQuery.zip, lastQuery.radiusMiles)
      .then((result) => {
        // Ignore anything but the newest request — rapid toggling can leave
        // slower earlier responses in flight.
        if (requestId !== estimateRequestRef.current) return
        setResponse(result)
        setError(null)
      })
      .catch((err: Error) => {
        if (requestId !== estimateRequestRef.current) return
        setError(err.message)
        setResponse(null)
      })
      .finally(() => {
        if (requestId === estimateRequestRef.current) setLoading(false)
      })
  }, [hospitalCodes, lastQuery])

  function handleSelectHospital(hospitalId: string) {
    setSelectedHospitalId(hospitalId)
    requestAnimationFrame(() =>
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  const selectedHospital =
    response?.results.find((r) => r.hospital.id === selectedHospitalId) ?? null
  const currentStepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              MyHealth Portal
            </h1>
            {encounter && (
              <p className="text-sm text-slate-600">
                Signed in as{' '}
                <span className="font-medium text-slate-800">
                  {encounter.patient_name}
                </span>
              </p>
            )}
          </div>

          <ol className="mt-4 flex flex-wrap gap-x-2 gap-y-1 text-sm">
            {STEPS.map((s, index) => {
              const reachable = index < currentStepIndex
              const active = index === currentStepIndex
              return (
                <li key={s.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!reachable) return
                      // Returning to the review step shows saved codes rather
                      // than re-running the model.
                      if (s.id === 'review' && extracted.length > 0) {
                        setServedFromCache(true)
                      }
                      setStep(s.id)
                    }}
                    disabled={!reachable}
                    className={
                      active
                        ? 'font-medium text-teal-800'
                        : reachable
                          ? 'text-slate-600 hover:text-teal-800 hover:underline'
                          : 'text-slate-400'
                    }
                  >
                    {index + 1}. {s.label}
                  </button>
                  {index < STEPS.length - 1 && (
                    <span className="text-slate-300">›</span>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <p className="mb-5 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Demo data.</strong> Visit summaries come from Abridge's
          synthetic encounter dataset — no real patients. Hospital names and
          locations are real, but every price shown here is synthetic and does
          not reflect what these hospitals actually charge.
        </p>

        {error && (
          <p className="mb-5 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">
            {error}
          </p>
        )}

        {step === 'review' && (
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            <VisitSummary
              encounters={encounters}
              selectedId={selectedEncounterId}
              encounter={encounter}
              summaryText={summaryText}
              codes={extracted}
              selectedCode={selectedCode}
              onSelectEncounter={setSelectedEncounterId}
              onSelectCode={setSelectedCode}
            />
            <ExtractionProgress
              steps={steps}
              codes={extracted}
              running={extracting}
              cached={servedFromCache}
              started={extractStarted}
              error={extractError}
              selectedCode={selectedCode}
              onRun={() => runExtraction(false)}
              onRegenerate={() => runExtraction(true)}
              onContinue={goToPricing}
              onSelectCode={setSelectedCode}
            />
          </div>
        )}

        {step === 'codes' && pricing && (
          <CodeBreakdown
            pricing={pricing}
            selectedCodes={costCodes}
            onToggle={toggleCostCode}
            onContinue={() => setStep('hospitals')}
          />
        )}

        {step === 'hospitals' && pricing && (
          <>
            <ProcedurePicker
              codes={pricing.codes}
              selected={hospitalCodes}
              onToggle={toggleHospitalCode}
              onSelectAll={() =>
                setHospitalCodes(
                  new Set(pricing.codes.map((c) => c.procedure.code)),
                )
              }
              onClear={() => setHospitalCodes(new Set())}
            />

            <div className="mt-5 rounded border border-slate-200 bg-white p-5">
              <SearchForm
                procedureCount={hospitalCodes.size}
                loading={loading}
                hasResults={response !== null}
                onSearch={handleSearch}
              />
            </div>

            {hospitalCodes.size === 0 && (
              <p className="mt-5 rounded border border-slate-200 bg-white px-4 py-6 text-center text-slate-600">
                Select at least one procedure above to compare hospitals.
              </p>
            )}

            {response && (
              <>
                <div className="mt-6 flex items-baseline justify-between">
                  <h2 className="text-lg font-medium text-slate-900">
                    {response.results.length}{' '}
                    {response.results.length === 1 ? 'hospital' : 'hospitals'}{' '}
                    for {response.procedures.length}{' '}
                    {response.procedures.length === 1
                      ? 'procedure'
                      : 'procedures'}
                  </h2>
                  <p className="text-sm text-slate-600">Sorted by lowest cost</p>
                </div>

                {response.results.length === 0 ? (
                  <p className="mt-4 rounded border border-slate-200 bg-white px-4 py-6 text-center text-slate-600">
                    No hospitals within that distance. Try a larger radius.
                  </p>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <HospitalList
                      results={response.results}
                      selectedId={selectedHospitalId}
                      onSelect={handleSelectHospital}
                    />
                    <HospitalMap
                      results={response.results}
                      selectedId={selectedHospitalId}
                      onSelect={handleSelectHospital}
                    />
                  </div>
                )}

                <div ref={detailRef} className="mt-6">
                  {selectedHospital ? (
                    <EstimateDetail
                      procedures={response.procedures}
                      estimate={selectedHospital}
                      createdDate={response.created_date}
                      validDays={response.valid_days}
                    />
                  ) : (
                    response.results.length > 0 && (
                      <p className="rounded border border-dashed border-slate-300 px-4 py-6 text-center text-slate-600">
                        Select a hospital from the list or map to see a full cost
                        breakdown.
                      </p>
                    )
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default App
