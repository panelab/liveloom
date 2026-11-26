export type DestinationState = 'idle' | 'connecting' | 'live' | 'retrying' | 'error'

export interface DestinationStatus {
  destinationId: string
  state: DestinationState
  message: string | null
  bitrateKbps: number | null
  startedAt: number | null
  updatedAt: number
}
