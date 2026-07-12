import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { simulateAllQualification, type AllQualificationResult } from '../engine/qualification'
import { createQualProbAccumulator } from '../engine/qualification/probability'
import { generateSeed } from '../engine/rng'
import { getRatings } from '../engine/matchEngine'
import { ALL_NATIONS } from '../data/nations'
import type { TeamRatings } from '../types/team'

/**
 * 예선 시뮬레이션에 쓸 능력치 맵을 만든다 (D1). getRatings로 컨디션·모멘텀·샌드박스 조정을
 * 반영하므로, 본선과 동일하게 샌드박스로 팀을 키우면 예선 결과에도 반영된다.
 */
function buildQualRatings(): Record<string, TeamRatings> {
  return Object.fromEntries(ALL_NATIONS.map((t) => [t.id, getRatings(t.id)]))
}

interface QualificationStore {
  seed: string | null
  result: AllQualificationResult | null
  /** 본선 진출 확률(%) — 계산 전 null (Q5) */
  probabilities: Record<string, number> | null
  probLoading: boolean
  simulate: (seed?: string) => void
  computeProbabilities: () => void
  reset: () => void
}

/** 진출 확률 계산 반복 수(온디맨드). */
const PROB_ITERATIONS = 120
const PROB_BATCH = 15
let probRunId = 0

/**
 * 지역예선 진행 상태 (Q3~Q5). 6개 대륙 예선 + 대륙간 PO로 본선 48국을 확정하고(simulate),
 * 여러 시드로 반복 시뮬레이션해 본선 진출 확률을 산출한다(computeProbabilities).
 */
export const useQualificationStore = create<QualificationStore>()(
  persist(
    (set, get) => ({
      seed: null,
      result: null,
      probabilities: null,
      probLoading: false,
      simulate: (seed) => {
        const usedSeed = seed && seed.trim() ? seed.trim().toUpperCase() : generateSeed()
        set({ seed: usedSeed, result: simulateAllQualification(usedSeed, buildQualRatings()), probabilities: null })
      },
      computeProbabilities: () => {
        const runId = ++probRunId
        const seedBase = get().seed ?? 'PROB'
        const ratings = buildQualRatings()
        set({ probLoading: true, probabilities: null })
        void (async () => {
          const acc = createQualProbAccumulator(seedBase, ratings)
          while (acc.done < PROB_ITERATIONS) {
            if (runId !== probRunId) return
            acc.runBatch(Math.min(PROB_BATCH, PROB_ITERATIONS - acc.done))
            await new Promise((r) => setTimeout(r, 0))
          }
          if (runId !== probRunId) return
          set({ probabilities: acc.result(), probLoading: false })
        })()
      },
      reset: () => {
        probRunId++
        set({ seed: null, result: null, probabilities: null, probLoading: false })
      },
    }),
    {
      name: 'wc2026-qualification-store',
      version: 2,
      partialize: (s) => ({ seed: s.seed, result: s.result, probabilities: s.probabilities }),
    },
  ),
)
