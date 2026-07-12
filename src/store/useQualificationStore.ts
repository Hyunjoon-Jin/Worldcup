import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { simulateConmebol } from '../engine/qualification/conmebol'
import { baseRatingsMap, nationsByConfederation } from '../data/nations'
import { createSeededRandom, generateSeed } from '../engine/rng'
import type { QualificationResult } from '../types/qualification'

interface QualificationStore {
  seed: string | null
  /** 대륙별 예선 결과 (현재 수직 슬라이스: CONMEBOL만) */
  results: Record<string, QualificationResult>
  /** 예선을 시드로 시뮬레이션한다(미지정 시 무작위 시드). */
  simulate: (seed?: string) => void
  reset: () => void
}

/**
 * 지역예선 진행 상태 (Q3). 현재는 CONMEBOL 한 대륙(수직 슬라이스)만 시뮬레이션한다.
 * 이후 대륙을 추가하면 results에 대륙별로 쌓고, Q4에서 통과국을 본선 조추첨으로 넘긴다.
 */
export const useQualificationStore = create<QualificationStore>()(
  persist(
    (set) => ({
      seed: null,
      results: {},
      simulate: (seed) => {
        const usedSeed = seed && seed.trim() ? seed.trim().toUpperCase() : generateSeed()
        const rand = createSeededRandom(`${usedSeed}-CONMEBOL`)
        const conmebolIds = nationsByConfederation('CONMEBOL').map((t) => t.id)
        const result = simulateConmebol(baseRatingsMap(conmebolIds), rand)
        set({ seed: usedSeed, results: { CONMEBOL: result } })
      },
      reset: () => set({ seed: null, results: {} }),
    }),
    { name: 'wc2026-qualification-store', version: 1 },
  ),
)
