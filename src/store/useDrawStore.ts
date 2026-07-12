import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { computePots, createInitialDrawState, drawNext, isDrawComplete, runSeededDraw, type DrawLogEntry, type DrawState } from '../engine/drawEngine'
import { generateSeed } from '../engine/rng'

interface DrawStore {
  state: DrawState
  log: DrawLogEntry[]
  history: DrawState[]
  isComplete: boolean
  /** 이 조추첨을 재현·공유할 수 있는 시드. 수동(한 팀씩) 추첨이면 null. */
  seed: string | null
  drawOne: () => void
  /** 시드로 조추첨을 처음부터 끝까지 한 번에 실행한다(미지정 시 무작위 시드 생성). */
  drawFromSeed: (seed?: string) => void
  /** 예선 통과 48개국으로 포트를 동적 계산해 조추첨을 즉시 실행한다 (지역예선 Q4). */
  drawFromField: (teamIds48: string[], seed?: string) => void
  reset: () => void
  undoLast: () => void
}

export const useDrawStore = create<DrawStore>()(
  persist(
    (set, get) => ({
      state: createInitialDrawState(),
      log: [],
      history: [],
      isComplete: false,
      seed: null,
      drawOne: () => {
        const current = get()
        const result = drawNext(current.state)
        if (!result) return
        set({
          state: result.state,
          log: [...current.log, result.entry],
          history: [...current.history, current.state],
          isComplete: isDrawComplete(result.state),
          seed: null, // 수동 추첨은 재현 불가
        })
      },
      drawFromSeed: (seed) => {
        const usedSeed = seed && seed.trim() ? seed.trim().toUpperCase() : generateSeed()
        const { state, log } = runSeededDraw(usedSeed)
        set({ state, log, history: [], isComplete: isDrawComplete(state), seed: usedSeed })
      },
      drawFromField: (teamIds48, seed) => {
        const usedSeed = seed && seed.trim() ? seed.trim().toUpperCase() : generateSeed()
        const { state, log } = runSeededDraw(usedSeed, computePots(teamIds48))
        set({ state, log, history: [], isComplete: isDrawComplete(state), seed: usedSeed })
      },
      reset: () => {
        set({ state: createInitialDrawState(), log: [], history: [], isComplete: false, seed: null })
      },
      undoLast: () => {
        const current = get()
        if (current.history.length === 0) return
        const prevState = current.history[current.history.length - 1]
        set({
          state: prevState,
          log: current.log.slice(0, -1),
          history: current.history.slice(0, -1),
          isComplete: false,
        })
      },
    }),
    { name: 'wc2026-draw-store', version: 1 },
  ),
)
