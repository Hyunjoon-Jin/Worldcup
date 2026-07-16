import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CUP_FORMATS, type CupId } from '../data/continental/formats'
import { selectCupParticipants } from '../engine/continental/participants'
import { runCup, type CupResult } from '../engine/continental/runCup'
import { computeCupProbabilities, type CupProbabilities } from '../engine/continental/cupProbability'
import { baseRatingsMap } from '../data/nations'
import { generateSeed } from '../engine/rng'

/**
 * 대륙별 대표 대회(컨티넨탈 챔피언십) 상태. 월드컵 스토어와 **완전히 분리**된 별도 persist 키로,
 * 월드컵 진행/저장 데이터와 충돌하지 않는다(기획 §5·감사 A6). 한 번에 하나의 대회만 활성.
 * 능력치는 전역(getRatings/buildSnapshot) 대신 정적 base 능력치를 써서 월드컵 상태 오염을 피한다(감사 A2).
 */
export const CUP_PROB_ITERATIONS = 200

interface ContinentalStore {
  activeCupId: CupId | null
  seed: string | null
  /** 개최국 팀 ID(홈 이점·자동 진출). null이면 개최국 없음. */
  hostId: string | null
  result: CupResult | null
  probabilities: CupProbabilities | null
  /** 대회 선택(결과 초기화). */
  selectCup: (id: CupId | null) => void
  setHost: (teamId: string | null) => void
  /** 활성 대회를 참가국 선정 → 전과정 시뮬레이션한다. rankByTeam(실시간 FIFA 순위) 있으면 참가국 선정에 반영. */
  runActiveCup: (opts?: { seed?: string; rankByTeam?: Record<string, number> }) => void
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
      selectCup: (id) => set({ activeCupId: id, result: null, probabilities: null, seed: null }),
      setHost: (teamId) => set({ hostId: teamId, result: null, probabilities: null }),
      runActiveCup: (opts) => {
        const { activeCupId, hostId } = get()
        if (!activeCupId) return
        const format = CUP_FORMATS[activeCupId]
        const usedSeed = opts?.seed && opts.seed.trim() ? opts.seed.trim().toUpperCase() : generateSeed()
        const hostIds = hostId ? [hostId] : []
        const field = selectCupParticipants(format, opts?.rankByTeam ?? {}, hostIds)
        const ratings = baseRatingsMap(field)
        const result = runCup(format, field, ratings, hostIds, usedSeed)
        set({ seed: usedSeed, result, probabilities: null })
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
      reset: () => set({ activeCupId: null, seed: null, hostId: null, result: null, probabilities: null }),
    }),
    { name: 'wc2026-continental-store', version: 1 },
  ),
)
