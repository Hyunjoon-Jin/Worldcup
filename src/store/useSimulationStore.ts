import { create } from 'zustand'
import { runMonteCarloSimulation } from '../engine/monteCarlo'
import type { SimulationResult } from '../types/simulation'

interface SimulationStore {
  result: SimulationResult | null
  iterations: number
  isComputing: boolean
  setIterations: (n: number) => void
  run: () => void
}

export const useSimulationStore = create<SimulationStore>()((set, get) => ({
  result: null,
  iterations: 1500,
  isComputing: false,
  setIterations: (n) => set({ iterations: n }),
  run: () => {
    set({ isComputing: true })
    // 다음 tick에서 실행해 "계산 중" 표시가 먼저 렌더링되도록 한다.
    setTimeout(() => {
      const result = runMonteCarloSimulation(get().iterations)
      set({ result, isComputing: false })
    }, 10)
  },
}))
