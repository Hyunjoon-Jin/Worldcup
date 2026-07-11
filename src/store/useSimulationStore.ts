import { create } from 'zustand'
import { createSimulationAccumulator } from '../engine/monteCarlo'
import { ITERATION_PRESETS, type IterationPreset } from '../engine/config'
import type { SimulationResult } from '../types/simulation'

interface SimulationStore {
  result: SimulationResult | null
  iterations: number
  isComputing: boolean
  /** 0..1 계산 진행률 */
  progress: number
  setIterations: (n: number) => void
  setPreset: (preset: IterationPreset) => void
  run: () => void
  reset: () => void
}

/** 한 번에 실행하는 배치 크기. 크면 빠르지만 UI가 더 오래 멈춘다. */
const BATCH_SIZE = 150

// 진행 중인 계산을 식별해, 새 계산이 시작되면 이전(오래된) 계산을 중단시키는 토큰 (B3).
let activeRunId = 0

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export const useSimulationStore = create<SimulationStore>()((set, get) => ({
  result: null,
  iterations: ITERATION_PRESETS.standard,
  isComputing: false,
  progress: 0,
  setIterations: (n) => set({ iterations: n }),
  setPreset: (preset) => set({ iterations: ITERATION_PRESETS[preset] }),
  run: () => {
    const runId = ++activeRunId
    const iterations = get().iterations
    set({ isComputing: true, progress: 0 })

    // 비동기 청크 실행: 배치마다 이벤트 루프에 양보해 UI가 멈추지 않게 하고,
    // 더 새로운 run()이 시작되면(runId 불일치) 즉시 중단한다.
    void (async () => {
      const acc = createSimulationAccumulator()
      while (acc.done < iterations) {
        if (runId !== activeRunId) return // 새 계산으로 대체됨 → 중단
        acc.runBatch(Math.min(BATCH_SIZE, iterations - acc.done))
        set({ progress: acc.done / iterations })
        await yieldToUi()
      }
      if (runId !== activeRunId) return
      set({ result: acc.result(), isComputing: false, progress: 1 })
    })()
  },
  reset: () => {
    activeRunId++ // 진행 중이던 계산 무효화
    set({ result: null, isComputing: false, progress: 0 })
  },
}))
