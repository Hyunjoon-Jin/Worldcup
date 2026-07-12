import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { simulateAllQualification, type AllQualificationResult } from '../engine/qualification'
import { createQualProbAccumulator } from '../engine/qualification/probability'
import { generateSeed } from '../engine/rng'

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
        set({ seed: usedSeed, result: simulateAllQualification(usedSeed), probabilities: null })
      },
      computeProbabilities: () => {
        const runId = ++probRunId
        const seedBase = get().seed ?? 'PROB'
        set({ probLoading: true, probabilities: null })
        void (async () => {
          const acc = createQualProbAccumulator(seedBase)
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
