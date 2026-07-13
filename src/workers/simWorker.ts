/// <reference lib="webworker" />
import { createSimulationAccumulator, type SimSnapshot } from '../engine/simCore'
import type { SimulationResult } from '../types/simulation'

interface RunMessage {
  snapshot: SimSnapshot
  iterations: number
  computedAt: number
}

export type WorkerOutMessage =
  | { type: 'progress'; progress: number }
  | { type: 'result'; result: SimulationResult }

const BATCH = 200

self.onmessage = (e: MessageEvent<RunMessage>) => {
  const { snapshot, iterations, computedAt } = e.data
  const acc = createSimulationAccumulator(snapshot)
  while (acc.done < iterations) {
    acc.runBatch(Math.min(BATCH, iterations - acc.done))
    ;(self as unknown as Worker).postMessage({ type: 'progress', progress: acc.done / iterations })
  }
  ;(self as unknown as Worker).postMessage({ type: 'result', result: acc.result(computedAt) })
}
