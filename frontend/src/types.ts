export type Procedure = {
  code: string
  code_type: string // CPT or HCPCS
  name: string
  description: string
  category: string
  confidence: string
  needs_review: boolean
}

export type Hospital = {
  id: string
  name: string
  address: string
  city: string
  state: string
  zip_code: string
  lat: number
  lng: number
  phone: string
}

/** Which published figure a quoted price came from. */
export type PriceBasis = 'cash' | 'negotiated'

export type Breakdown = {
  patient_responsibility: number
  basis: PriceBasis
  /** null means the hospital doesn't publish it — render nothing. */
  without_insurance: number | null
  with_insurance: number | null
  expected_low: number | null
  expected_high: number | null
  gross: number | null
  discount: number | null
  n_payers: number
  limited_data: boolean
  reference_number: string
}

export type LineItem = {
  procedure: Procedure
  patient_responsibility: number
  basis: PriceBasis
}

export type HospitalEstimate = {
  hospital: Hospital
  distance_miles: number
  breakdown: Breakdown
  line_items: LineItem[]
  covered_count: number
  requested_count: number
}

export type EstimateResponse = {
  procedures: Procedure[]
  results: HospitalEstimate[]
  created_date: string
  valid_days: number
  /** Hospitals within range that the paediatric filter keeps off the map. */
  hidden_paediatric_count: number
}

export type EncounterSummary = {
  id: string
  patient_name: string
  visit_title: string
  date: string
  /** False when the encounter yields no priced follow-up codes. */
  has_codes: boolean
}

export type Encounter = EncounterSummary & {
  after_visit_summary: string
}

export type ExtractedCode = {
  code: string
  code_type: string
  name: string
  description: string
  /** The summary line this code came from, verbatim. */
  rationale: string
  /** 0-based index of that line; null when it couldn't be resolved. */
  line: number | null
  needs_review: boolean
  confidence: string
}

export type PriceSource = {
  hospital_id: string
  hospital_name: string
  amount: number
  basis: PriceBasis
  /** False when the hospital publishes a price but isn't shown on the map. */
  shown: boolean
}

export type CodePricing = {
  procedure: Procedure
  average: number
  lowest: number
  /** How many hospitals publish a price for this code. */
  n_hospitals: number
  /** Every hospital publishing this code, revealed on hover. */
  sources: PriceSource[]
}

export type PricingResponse = {
  codes: CodePricing[]
  total_average: number
  total_lowest: number
}
