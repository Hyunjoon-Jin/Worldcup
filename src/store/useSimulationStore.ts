import { create } from 'zustand'
import { createSimulationAccumulator } from '../engine/simCore'
import { buildSnapshot } from '../engine/buildSnapshot'
import { ITERATION_PRESETS, type IterationPreset } from '../engine/config'
import { useProgressStore } from './useProgressStore'
import type { SimSnapshot } from '../engine/simCore'
import type { WorkerOutMessage } from '../workers/simWorker'
import type { SimulationResult } from '../types/simulation'

export interface ProbPoint {
  matchesPlayed: number
  probs: Record<string, number>
}

interface SimulationStore {
  result: SimulationResult | null
  iterations: number
  isComputing: boolean
  progress: number
  history: ProbPoint[]
  setIterations: (n: number) => void
  setPreset: (preset: IterationPreset) => void
  run: () => void
  reset: () => void
}

const BATCH_SIZE = 150

// 진행 중인 계산을 식별해 새 계산이 시작되면 이전 계산을 중단시키는 토큰 (B3).
let activeRunId = 0
let activeWorker: Worker | null = null

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function countMatchesPlayed(): number {
  const p = useProgressStore.getState()
  const ko = Object.values(p.knockoutSlots).filter((s) => s.result).length
  return p.groupMatches.length + ko
}

function appendHistory(history: ProbPoint[], result: SimulationResult): ProbPoint[] {
  const matchesPlayed = countMatchesPlayed()
  const probs: Record<string, number> = {}
  for (const [teamId, p] of Object.entries(result.probabilities)) probs[teamId] = p.championPct
  const kept = history.filter((h) => h.matchesPlayed < matchesPlayed)
  return [...kept, { matchesPlayed, probs }]
}

function terminateWorker() {
  if (activeWorker) {
    activeWorker.terminate()
    activeWorker = null
  }
}

export const useSimulationStore = create<SimulationStore>()((set, get) => {
  const finish = (runId: number, result: SimulationResult) => {
    if (runId !== activeRunId) return
    set({ result, isComputing: false, progress: 1, history: appendHistory(get().history, result) })
  }

  // 메인스레드 폴백(워커 미지원/실패 시): 비동기 청크 실행으로 UI를 멈추지 않는다.
  const runOnMainThread = async (runId: number, snapshot: SimSnapshot, iterations: number) => {
    const acc = createSimulationAccumulator(snapshot)
    while (acc.done < iterations) {
      if (runId !== activeRunId) return
      acc.runBatch(Math.min(BATCH_SIZE, iterations - acc.done))
      set({ progress: acc.done / iterations })
      await yieldToUi()
    }
    finish(runId, acc.result(Date.now()))
  }

  return {
    result: null,
    iterations: ITERATION_PRESETS.standard,
    isComputing: false,
    progress: 0,
    history: [],
    setIterations: (n) => set({ iterations: n }),
    setPreset: (preset) => set({ iterations: ITERATION_PRESETS[preset] }),
    run: () => {
      const runId = ++activeRunId
      const iterations = get().iterations
      const snapshot = buildSnapshot()
      set({ isComputing: true, progress: 0 })
      terminateWorker()

      // 우선 Web Worker에서 실행해 무거운 계산을 메인스레드에서 완전히 분리한다 (v2 #42).
      if (typeof Worker !== 'undefined') {
        try {
          const worker = new Worker(new URL('../workers/simWorker.ts', import.meta.url), { type: 'module' })
          activeWorker = worker
          worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
            if (runId !== activeRunId) return
            const msg = e.data
            if (msg.type === 'progress') {
              set({ progress: msg.progress })
            } else {
              finish(runId, msg.result)
              if (activeWorker === worker) activeWorker = null
              worker.terminate()
            }
          }
          worker.onerror = () => {
            worker.terminate()
            if (activeWorker === worker) activeWorker = null
            void runOnMainThread(runId, snapshot, iterations) // 폴백
          }
          worker.postMessage({ snapshot, iterations, computedAt: Date.now() })
          return
        } catch {
          /* 워커 생성 실패 → 메인스레드 폴백 */
        }
      }
      void runOnMainThread(runId, snapshot, iterations)
    },
    reset: () => {
      activeRunId++
      terminateWorker()
      set({ result: null, isComputing: false, progress: 0, history: [] })
    },
  }
})
