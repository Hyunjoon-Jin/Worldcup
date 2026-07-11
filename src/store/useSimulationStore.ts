import { create } from 'zustand'
import { runMonteCarloSimulation } from '../engine/monteCarlo'
import type { SimulationResult } from '../types/simulation'

interface SimulationStore {
  result: SimulationResult | null
  /** 직전 계산 결과 — 경기 진행 등으로 확률이 재계산되기 전 값. "위기"(확률 급락) 판정에 쓰인다. */
  previousResult: SimulationResult | null
  iterations: number
  isComputing: boolean
  setIterations: (n: number) => void
  run: () => void
  reset: () => void
}

export const useSimulationStore = create<SimulationStore>()((set, get) => ({
  result: null,
  previousResult: null,
  iterations: 1500,
  isComputing: false,
  setIterations: (n) => set({ iterations: n }),
  run: () => {
    set({ isComputing: true })
    // 다음 tick에서 실행해 "계산 중" 표시가 먼저 렌더링되도록 한다.
    setTimeout(() => {
      const result = runMonteCarloSimulation(get().iterations)
      set((state) => ({ result, previousResult: state.result, isComputing: false }))
    }, 10)
  },
  reset: () => set({ result: null, previousResult: null, isComputing: false }),
}))
