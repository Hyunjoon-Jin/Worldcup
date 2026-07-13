import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { computePots, createInitialDrawState, drawNext, isDrawComplete, runSeededDraw, type DrawLogEntry, type DrawState, type PotPools } from '../engine/drawEngine'
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
  /** 이 조추첨의 포트 구성(랭킹순, 개최국 제외). 포트 화면 표시용 — 아직 뽑지 않은 팀 구분에 쓴다. */
  potComposition: PotPools | null
  /** 포트 산정에 쓴 현재 FIFA 점수(팀ID→점수). 포트 화면에서 현재 랭킹 표시에 쓴다. */
  rankPoints: Record<string, number> | null
  drawOne: () => void
  /** 시드로 조추첨을 처음부터 끝까지 한 번에 실행한다(미지정 시 무작위 시드 생성). */
  drawFromSeed: (seed?: string) => void
  /** 예선 통과 48개국으로 포트를 동적 계산해 조추첨을 즉시 실행한다 (지역예선 Q4).
   *  rankPoints를 주면 현재 FIFA 점수로 포트를 시딩한다. */
  drawFromField: (teamIds48: string[], seed?: string, rankPoints?: Record<string, number>) => void
  /** 예선 통과 48개국으로 포트만 준비하고(개최국 사전 배치), 실제 추첨은 아직 하지 않는다.
   *  이후 사용자가 한 팀씩(drawOne) 또는 시드로(drawFromSeed) 순서대로 진행한다.
   *  rankPoints를 주면 현재 FIFA 점수로 포트를 시딩한다. */
  prepareFromField: (teamIds48: string[], rankPoints?: Record<string, number>) => void
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
      potComposition: null,
      rankPoints: null,
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
        const rankPoints = get().rankPoints ?? undefined
        const pots = field ? computePots(field, undefined, rankPoints) : undefined
        const { state, log } = runSeededDraw(usedSeed, pots)
        set({ state, log, history: [], isComplete: isDrawComplete(state), seed: usedSeed, potComposition: pots ?? null })
      },
      drawFromField: (teamIds48, seed, rankPoints) => {
        const usedSeed = seed && seed.trim() ? seed.trim().toUpperCase() : generateSeed()
        const pots = computePots(teamIds48, undefined, rankPoints)
        const { state, log } = runSeededDraw(usedSeed, pots)
        set({
          state,
          log,
          history: [],
          isComplete: isDrawComplete(state),
          seed: usedSeed,
          fieldTeams: teamIds48,
          potComposition: pots,
          rankPoints: rankPoints ?? null,
        })
      },
      prepareFromField: (teamIds48, rankPoints) => {
        // 개최국을 각 조 1번 시드에 사전 배치하고 포트를 채운 "추첨 대기" 상태로 만든다(추첨 미실행).
        const pots = computePots(teamIds48, undefined, rankPoints)
        set({
          state: createInitialDrawState(Math.random, pots),
          log: [],
          history: [],
          isComplete: false,
          seed: null,
          fieldTeams: teamIds48,
          potComposition: pots,
          rankPoints: rankPoints ?? null,
        })
      },
      reset: () => {
        set({
          state: createInitialDrawState(),
          log: [],
          history: [],
          isComplete: false,
          seed: null,
          fieldTeams: null,
          potComposition: null,
          rankPoints: null,
        })
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
