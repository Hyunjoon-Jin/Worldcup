/// <reference lib="webworker" />
import { createQualProbAccumulator } from '../engine/qualification/probability'
import { buildLockedLookups, type LockedMatchData } from '../engine/qualification/conditional'
import type { TeamRatings } from '../types/team'

interface RunMessage {
  seedBase: string
  ratings: Record<string, TeamRatings>
  iterations: number
  /** 이미 치른 경기(대륙별) — 조건부 확률(실황 반영)용. 없으면 무조건 확률. */
  locked?: Record<string, LockedMatchData[]>
  /** 현재 대회 개최국(커리어 모드 — 대회마다 개최국이 바뀜). 없으면 기본(2026) 개최국. */
  hostIds?: string[]
}

export type QualWorkerOut =
  | { type: 'progress'; progress: number }
  | { type: 'result'; probabilities: Record<string, number> }

const BATCH = 20

self.onmessage = (e: MessageEvent<RunMessage>) => {
  const { seedBase, ratings, iterations, locked, hostIds } = e.data
  const lockedByConfed = locked ? buildLockedLookups(locked) : undefined
  const acc = createQualProbAccumulator(seedBase, ratings, lockedByConfed, hostIds)
  while (acc.done < iterations) {
    acc.runBatch(Math.min(BATCH, iterations - acc.done))
    ;(self as unknown as Worker).postMessage({ type: 'progress', progress: acc.done / iterations })
  }
  ;(self as unknown as Worker).postMessage({ type: 'result', probabilities: acc.result() })
}
