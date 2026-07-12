import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { simulateAllQualification, type AllQualificationResult } from '../engine/qualification'
import { generateSeed } from '../engine/rng'

interface QualificationStore {
  seed: string | null
  result: AllQualificationResult | null
  /** 전체 지역예선을 시드로 시뮬레이션한다(미지정 시 무작위 시드). */
  simulate: (seed?: string) => void
  reset: () => void
}

/**
 * 지역예선 진행 상태 (Q3). 6개 대륙 예선 + 대륙간 플레이오프를 한 번에 시뮬레이션해
 * 본선 48개국을 확정한다. Q4에서 이 48국을 본선 조추첨으로 넘긴다.
 */
export const useQualificationStore = create<QualificationStore>()(
  persist(
    (set) => ({
      seed: null,
      result: null,
      simulate: (seed) => {
        const usedSeed = seed && seed.trim() ? seed.trim().toUpperCase() : generateSeed()
        set({ seed: usedSeed, result: simulateAllQualification(usedSeed) })
      },
      reset: () => set({ seed: null, result: null }),
    }),
    { name: 'wc2026-qualification-store', version: 2 },
  ),
)
