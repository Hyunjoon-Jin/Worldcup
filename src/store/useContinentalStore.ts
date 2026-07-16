import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CUP_FORMATS, type CupId } from '../data/continental/formats'
import { selectCupParticipants } from '../engine/continental/participants'
import { runCup, type CupResult } from '../engine/continental/runCup'
import { computeCupProbabilities, type CupProbabilities } from '../engine/continental/cupProbability'
import { baseRatingsMap } from '../data/nations'
import { generateSeed } from '../engine/rng'
import { useContinentalHistoryStore } from './useContinentalHistoryStore'

/**
 * 대륙별 대표 대회(컨티넨탈 챔피언십) 상태. 월드컵 스토어와 **완전히 분리**된 별도 persist 키로,
 * 월드컵 진행/저장 데이터와 충돌하지 않는다(기획 §5·감사 A6). 한 번에 하나의 대회만 활성.
 * 능력치는 전역(getRatings/buildSnapshot) 대신 정적 base 능력치를 써서 월드컵 상태 오염을 피한다(감사 A2).
 */
export const CUP_PROB_ITERATIONS = 200

/** 대회 진행 단계 수 = 조추첨(0) 이후 조별 3라운드 + 녹아웃 라운드 수. */
export function cupTotalStages(cupId: CupId): number {
  return 3 + CUP_FORMATS[cupId].knockout.length
}

interface ContinentalStore {
  activeCupId: CupId | null
  seed: string | null
  /** 개최국 팀 ID(홈 이점·자동 진출). null이면 개최국 없음. */
  hostId: string | null
  result: CupResult | null
  probabilities: CupProbabilities | null
  /** 진행 단계 커서. 0=조추첨(조편성만), 1~3=조별 MD1~3, 4~=녹아웃 라운드. 월드컵 '일정 진행'과 동형. */
  stage: number
  /** 대회 선택(결과 초기화). */
  selectCup: (id: CupId | null) => void
  setHost: (teamId: string | null) => void
  /** 활성 대회를 참가국 선정 → 전과정 시뮬레이션한다(결과는 precompute, 단계별로 공개). */
  runActiveCup: (opts?: { seed?: string; rankByTeam?: Record<string, number> }) => void
  /** 한 단계 진행(다음 경기일/라운드 공개). */
  advanceStage: () => void
  /** 끝까지 진행(전 결과 공개). */
  advanceToEnd: () => void
  /** 활성 대회 확률(조별통과·라운드도달·우승) 계산. */
  computeProbabilities: (iterations?: number) => void
  reset: () => void
}

export const useContinentalStore = create<ContinentalStore>()(
  persist(
    (set, get) => ({
      activeCupId: null,
      seed: null,
      hostId: null,
      result: null,
      probabilities: null,
      stage: 0,
      selectCup: (id) => set({ activeCupId: id, result: null, probabilities: null, seed: null, stage: 0 }),
      setHost: (teamId) => set({ hostId: teamId, result: null, probabilities: null, stage: 0 }),
      runActiveCup: (opts) => {
        const { activeCupId, hostId } = get()
        if (!activeCupId) return
        const format = CUP_FORMATS[activeCupId]
        const usedSeed = opts?.seed && opts.seed.trim() ? opts.seed.trim().toUpperCase() : generateSeed()
        const hostIds = hostId ? [hostId] : []
        const field = selectCupParticipants(format, opts?.rankByTeam ?? {}, hostIds)
        const ratings = baseRatingsMap(field)
        const result = runCup(format, field, ratings, hostIds, usedSeed)
        // 결과는 즉시 계산하되 조추첨(stage 0)부터 단계별로 공개한다(월드컵 '일정 진행'과 동형).
        set({ seed: usedSeed, result, probabilities: null, stage: 0 })
        // 완주한 대회를 역대 기록에 축적(대회·시드 dedup). 팀 페이지 통산 성적에 반영.
        useContinentalHistoryStore.getState().record({
          cupId: activeCupId,
          seed: usedSeed,
          champion: result.champion,
          runnerUp: result.runnerUp,
          third: result.third,
          qualified: result.qualified,
        })
      },
      advanceStage: () => {
        const { activeCupId, result, stage } = get()
        if (!activeCupId || !result) return
        set({ stage: Math.min(stage + 1, cupTotalStages(activeCupId)) })
      },
      advanceToEnd: () => {
        const { activeCupId, result } = get()
        if (!activeCupId || !result) return
        set({ stage: cupTotalStages(activeCupId) })
      },
      computeProbabilities: (iterations = CUP_PROB_ITERATIONS) => {
        const { activeCupId, hostId, result } = get()
        if (!activeCupId || !result) return
        const format = CUP_FORMATS[activeCupId]
        const hostIds = hostId ? [hostId] : []
        const field = result.groups.flatMap((g) => g.teams)
        const ratings = baseRatingsMap(field)
        const seedBase = get().seed ?? 'CUP'
        const probabilities = computeCupProbabilities(format, field, ratings, hostIds, iterations, `${seedBase}-PROB`)
        set({ probabilities })
      },
      reset: () => set({ activeCupId: null, seed: null, hostId: null, result: null, probabilities: null, stage: 0 }),
    }),
    { name: 'wc2026-continental-store', version: 1 },
  ),
)
