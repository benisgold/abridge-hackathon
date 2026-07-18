/** The two Claude models the extraction UI lets you choose between. */
export type ModelId = 'claude-haiku-4-5' | 'claude-sonnet-5'

export type ModelOption = {
  id: ModelId
  label: string
  blurb: string
}

export const EXTRACTION_MODELS: ModelOption[] = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', blurb: 'Fast' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', blurb: 'Most capable' },
]

export const DEFAULT_MODEL: ModelId = 'claude-haiku-4-5'
