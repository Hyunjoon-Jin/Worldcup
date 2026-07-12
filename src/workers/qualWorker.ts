/// <reference lib="webworker" />
import { createQualProbAccumulator } from '../engine/qualification/probability'
import type { TeamRatings } from '../types/team'

interface RunMessage {
  seedBase: string
  ratings: Record<string, TeamRatings>
  iterations: number
}

export type QualWorkerOut =
  | { type: 'progress'; progress: number }
  | { type: 'result'; probabilities: Record<string, number> }

const BATCH = 20

self.onmessage = (e: MessageEvent<RunMessage>) => {
  const { seedBase, ratings, iterations } = e.data
  const acc = createQualProbAccumulator(seedBase, ratings)
  while (acc.done < iterations) {
    acc.runBatch(Math.min(BATCH, iterations - acc.done))
    ;(self as unknown as Worker).postMessage({ type: 'progress', progress: acc.done / iterations })
  }
  ;(self as unknown as Worker).postMessage({ type: 'result', probabilities: acc.result() })
}
