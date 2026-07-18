export type Procedure = {
  code: string
  name: string
  description: string
  /** null = not in the demo catalog, so coverage is unknown (never guessed). */
  medicare_covered: boolean | null
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

export type Breakdown = {
  hospital_fees: number
  physician_fees: number
  total_fees: number
  discount: number
  patient_responsibility: number
  low: number
  high: number
  reference_number: string
}

export type LineItem = {
  procedure: Procedure
  patient_responsibility: number
  total_fees: number
}

export type HospitalEstimate = {
  hospital: Hospital
  distance_miles: number
  breakdown: Breakdown
  line_items: LineItem[]
}

export type EstimateResponse = {
  procedures: Procedure[]
  results: HospitalEstimate[]
  created_date: string
  valid_days: number
}

export type EncounterSummary = {
  id: string
  patient_name: string
  visit_title: string
  date: string
}

export type Encounter = EncounterSummary & {
  after_visit_summary: string
}

export type ExtractedCode = {
  code: string
  name: string
  description: string
  /** Verbatim excerpt of the summary line that prompted this code. */
  rationale: string
  /** 0-based index of that line; null when it couldn't be resolved. */
  line: number | null
}

export type CodePricing = {
  procedure: Procedure
  average: number
  lowest: number
  in_catalog: boolean
}

export type PricingResponse = {
  codes: CodePricing[]
  total_average: number
  total_lowest: number
}
