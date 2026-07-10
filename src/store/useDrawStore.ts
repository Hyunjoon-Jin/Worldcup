import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createInitialDrawState, drawNext, isDrawComplete, type DrawLogEntry, type DrawState } from '../engine/drawEngine'

interface DrawStore {
  state: DrawState
  log: DrawLogEntry[]
  history: DrawState[]
  isComplete: boolean
  drawOne: () => void
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
      drawOne: () => {
        const current = get()
        const result = drawNext(current.state)
        if (!result) return
        set({
          state: result.state,
          log: [...current.log, result.entry],
          history: [...current.history, current.state],
          isComplete: isDrawComplete(result.state),
        })
      },
      reset: () => {
        set({ state: createInitialDrawState(), log: [], history: [], isComplete: false })
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
    { name: 'wc2026-draw-store' },
  ),
)
