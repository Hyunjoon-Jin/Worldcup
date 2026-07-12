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
  /** 예선 통과 48개국(포트 계산 기준). 예선에서 넘어온 조추첨이면 그 48개국, 아니면 null. */
  fieldTeams: string[] | null
  drawOne: () => void
  /** 시드로 조추첨을 처음부터 끝까지 한 번에 실행한다(미지정 시 무작위 시드 생성). */
  drawFromSeed: (seed?: string) => void
  /** 예선 통과 48개국으로 포트를 동적 계산해 조추첨을 즉시 실행한다 (지역예선 Q4). */
  drawFromField: (teamIds48: string[], seed?: string) => void
  /** 예선 통과 48개국으로 포트만 준비하고(개최국 사전 배치), 실제 추첨은 아직 하지 않는다.
   *  이후 사용자가 한 팀씩(drawOne) 또는 시드로(drawFromSeed) 순서대로 진행한다. */
  prepareFromField: (teamIds48: string[]) => void
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
      fieldTeams: null,
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
        // 예선에서 넘어온 조추첨이면 그 48개국 포트로, 아니면 기본 포트로 추첨한다.
        const field = get().fieldTeams
        const { state, log } = runSeededDraw(usedSeed, field ? computePots(field) : undefined)
        set({ state, log, history: [], isComplete: isDrawComplete(state), seed: usedSeed })
      },
      drawFromField: (teamIds48, seed) => {
        const usedSeed = seed && seed.trim() ? seed.trim().toUpperCase() : generateSeed()
        const { state, log } = runSeededDraw(usedSeed, computePots(teamIds48))
        set({ state, log, history: [], isComplete: isDrawComplete(state), seed: usedSeed, fieldTeams: teamIds48 })
      },
      prepareFromField: (teamIds48) => {
        // 개최국을 각 조 1번 시드에 사전 배치하고 포트를 채운 "추첨 대기" 상태로 만든다(추첨 미실행).
        set({
          state: createInitialDrawState(Math.random, computePots(teamIds48)),
          log: [],
          history: [],
          isComplete: false,
          seed: null,
          fieldTeams: teamIds48,
        })
      },
      reset: () => {
        set({ state: createInitialDrawState(), log: [], history: [], isComplete: false, seed: null, fieldTeams: null })
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
