import type {
  Encounter,
  EncounterSummary,
  EstimateResponse,
  ExtractedCode,
  PricingResponse,
} from './types'

/** Surfaces the backend's `detail` message rather than a bare status code. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // Non-JSON error body (e.g. the proxy is up but the backend is not).
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

function postJSON<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function fetchEncounters(): Promise<EncounterSummary[]> {
  return request<EncounterSummary[]>('/api/encounters')
}

export function fetchEncounter(id: string): Promise<Encounter> {
  return request<Encounter>(`/api/encounters/${encodeURIComponent(id)}`)
}

export function fetchPricing(
  encounterId: string,
  codes: string[],
): Promise<PricingResponse> {
  return postJSON<PricingResponse>('/api/pricing', {
    encounter_id: encounterId,
    codes,
  })
}

export function fetchEstimates(
  encounterId: string,
  codes: string[],
  zip: string,
  radiusMiles: number,
): Promise<EstimateResponse> {
  const params = new URLSearchParams({
    encounter_id: encounterId,
    zip,
    radius_miles: String(radiusMiles),
  })
  for (const code of codes) params.append('codes', code)
  return request<EstimateResponse>(`/api/estimates?${params}`)
}

type ExtractHandlers = {
  onStep: (label: string) => void
  onCode: (code: ExtractedCode) => void
  onDone: (count: number) => void
  onError: (message: string) => void
}

/**
 * Streams the extraction over SSE.
 *
 * Uses fetch + a manual parser rather than EventSource because EventSource
 * cannot issue a POST, and the summary text has to go in the request body.
 */
export async function streamExtraction(
  body: { encounter_id?: string; summary_text?: string },
  handlers: ExtractHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    handlers.onError((err as Error).message)
    return
  }

  if (!res.ok || !res.body) {
    handlers.onError(`Extraction request failed (${res.status})`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line.
      let split: number
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)
        dispatchFrame(frame, handlers)
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      handlers.onError((err as Error).message)
    }
  }
}

function dispatchFrame(frame: string, handlers: ExtractHandlers) {
  let event = ''
  let data = ''
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!event || !data) return

  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return
  }

  switch (event) {
    case 'step':
      handlers.onStep((parsed as { label: string }).label)
      break
    case 'code':
      handlers.onCode(parsed as ExtractedCode)
      break
    case 'done':
      handlers.onDone((parsed as { count: number }).count)
      break
    case 'error':
      handlers.onError((parsed as { message: string }).message)
      break
  }
}
