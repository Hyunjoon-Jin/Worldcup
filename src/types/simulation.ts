export interface TeamProbabilities {
  teamId: string
  groupStagePct: number
  r16Pct: number
  qfPct: number
  sfPct: number
  finalPct: number
  championPct: number
}

export interface SimulationResult {
  iterations: number
  computedAt: number
  probabilities: Record<string, TeamProbabilities>
}
