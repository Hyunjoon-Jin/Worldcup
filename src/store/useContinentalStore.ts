import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CUP_FORMATS, type CupId } from '../data/continental/formats'
import { runCup, type CupResult } from '../engine/continental/runCup'
import { runCupQualification, type CupQualResult } from '../engine/continental/cupQualification'
import { computeCupProbabilitiesLive, type CupProbabilities } from '../engine/continental/cupProbability'
import type { CupWorkerOut } from '../workers/cupWorker'
import { selectCupHosts } from '../engine/continental/hostSelection'
import { cupScheduleDays } from '../engine/continental/cupSchedule'
import { baseRatingsMap, nationsByConfederation } from '../data/nations'
import { BASE_FINALS_YEAR } from '../data/calendar'
import { generateSeed } from '../engine/rng'
import { useContinentalHistoryStore } from './useContinentalHistoryStore'

/**
 * 대륙별 대표 대회(컨티넨탈 챔피언십) 상태. 월드컵 스토어와 **완전히 분리**된 별도 persist 키로,
 * 월드컵 진행/저장 데이터와 충돌하지 않는다(기획 §5·감사 A6). 한 번에 하나의 대회만 활성.
 * 능력치는 전역(getRatings/buildSnapshot) 대신 정적 base 능력치를 써서 월드컵 상태 오염을 피한다(감사 A2).
 */
export const CUP_PROB_ITERATIONS = 200

// 확률 계산 취소/경합 처리용 모듈 싱글턴(예선 워커 패턴 미러). 진행 중 다시 계산 요청이 오면
// 이전 워커를 종료하고 runId로 지난 결과를 무시한다.
let cupProbRunId = 0
let cupProbWorker: Worker | null = null

/** 진행 중인 확률 계산을 취소한다(runId 무효화 + 워커 종료). 대회 전환·초기화 시 호출. */
function cancelCupProb(): void {
  cupProbRunId++
  if (cupProbWorker) {
    cupProbWorker.terminate()
    cupProbWorker = null
  }
}

/** 대회 진행 단계 수 = 조추첨(0) 이후 조별 3라운드 + 녹아웃 라운드 수. */
export function cupTotalStages(cupId: CupId): number {
  return 3 + CUP_FORMATS[cupId].knockout.length
}

interface ContinentalStore {
  activeCupId: CupId | null
  seed: string | null
  /** 개최국 팀 ID(홈 이점·자동 진출). 에디션(cupId+연도)별로 경제·지역 가중 랜덤으로 자동 선정. 공동개최 시 2~3국. */
  hostIds: string[]
  /** 이 대회의 개최 연도(시즌 타임라인에서 진입 시 설정). null이면 연도 미표시. */
  cupYear: number | null
  /** 예선 결과(참가국을 가린다). */
  qualResult: CupQualResult | null
  result: CupResult | null
  probabilities: CupProbabilities | null
  /** 확률 재계산 중 여부(워커 실행 중). 기존 확률은 화면에 유지하고 갱신 배지만 띄운다. */
  probLoading: boolean
  /** 우승 확률 추이(단계별 스냅샷) — 월드컵 ProbabilityTrendChart와 동형. stage→팀별 우승% */
  championTrend: Array<{ stage: number; byTeam: Record<string, number> }>
  /** 진행 단계 커서. 0=조추첨(조편성만), 1~3=조별 MD1~3, 4~=녹아웃 라운드. 월드컵 '일정 진행'과 동형. */
  stage: number
  /** 진행 중 단계(stage+1) 안에서 공개된 시간대 수(월드컵 '다음 시간대 진행'과 동형). 단계가 바뀌면 0으로 리셋. */
  slotStep: number
  /** 조추첨 공개 팀 수(0=아직 안 뽑음). 월드컵 조추첨처럼 팀을 하나씩 뽑는 연출용. field 크기에 도달하면 완료. */
  drawRevealCount: number
  /** 대회 선택(결과 초기화). year를 주면 그 개최 연도로 표시하고, 개최국을 자동 선정한다. */
  selectCup: (id: CupId | null, year?: number | null) => void
  /** 활성 대회를 참가국 선정 → 전과정 시뮬레이션한다(결과는 precompute, 단계별로 공개). */
  runActiveCup: (opts?: { seed?: string; rankByTeam?: Record<string, number> }) => void
  /** 조추첨 — 다음 팀 한 명 공개(월드컵 '다음 국가 뽑기'와 동형). */
  revealDrawTeam: () => void
  /** 조추첨 — 직전 뽑기 되돌리기. */
  undoDrawTeam: () => void
  /** 조추첨 — 전체 즉시 공개. */
  revealAllDraw: () => void
  /** 다음 시간대 진행(월드컵 '다음 시간대 진행'과 동형) — 현재 단계의 다음 시간대 경기만 공개. */
  advanceTimeSlot: () => void
  /** 한 단계(하루=매치데이/라운드) 진행 — 남은 시간대까지 모두 공개(월드컵 '다음 날 전체 진행'과 동형). */
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
      hostIds: [],
      cupYear: null,
      qualResult: null,
      result: null,
      probabilities: null,
      probLoading: false,
      championTrend: [],
      stage: 0,
      slotStep: 0,
      drawRevealCount: 0,
      selectCup: (id, year = null) => {
        cancelCupProb() // 진행 중이던 확률 계산을 취소(새 대회에 지난 결과가 반영되지 않도록).
        set({
          activeCupId: id,
          cupYear: year,
          // 개최국은 에디션(cupId+연도)의 고정 속성 — 경제·지역 가중 랜덤으로 자동 선정(공동개최 가능).
          hostIds: id ? selectCupHosts(CUP_FORMATS[id], `${id}-${year ?? 0}`) : [],
          qualResult: null,
          result: null,
          probabilities: null,
          probLoading: false,
          championTrend: [],
          seed: null,
          stage: 0,
          slotStep: 0,
          drawRevealCount: 0,
        })
      },
      runActiveCup: (opts) => {
        const { activeCupId, hostIds } = get()
        if (!activeCupId) return
        cancelCupProb() // 새 시뮬 시작 — 진행 중이던 확률 계산 취소.
        const format = CUP_FORMATS[activeCupId]
        const usedSeed = opts?.seed && opts.seed.trim() ? opts.seed.trim().toUpperCase() : generateSeed()
        // 1) 예선으로 참가국을 가린다. 2) 통과국으로 본선을 시뮬레이션한다.
        const poolIds = [...new Set(format.confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))]
        const qualResult = runCupQualification(format, baseRatingsMap(poolIds), hostIds, usedSeed, opts?.rankByTeam ?? {})
        const field = qualResult.qualified
        const ratings = baseRatingsMap(field)
        const result = runCup(format, field, ratings, hostIds, usedSeed)
        // 결과는 즉시 계산하되 조추첨(stage 0)부터 단계별로 공개한다(월드컵 '일정 진행'과 동형).
        // drawRevealCount=0 → 조추첨은 팀을 하나씩 뽑는 연출로 시작(월드컵 조추첨과 동형).
        set({ seed: usedSeed, qualResult, result, probabilities: null, probLoading: false, championTrend: [], stage: 0, slotStep: 0, drawRevealCount: 0 })
        // 완주한 대회를 역대 기록에 축적(대회·시드 dedup). 팀 페이지 통산 성적에 반영.
        useContinentalHistoryStore.getState().record({
          cupId: activeCupId,
          seed: usedSeed,
          year: get().cupYear ?? undefined,
          champion: result.champion,
          runnerUp: result.runnerUp,
          third: result.third,
          qualified: result.qualified,
        })
      },
      revealDrawTeam: () => {
        const { result, drawRevealCount } = get()
        if (!result) return
        const total = result.groups.reduce((n, g) => n + g.teams.length, 0)
        set({ drawRevealCount: Math.min(drawRevealCount + 1, total) })
      },
      undoDrawTeam: () => set({ drawRevealCount: Math.max(0, get().drawRevealCount - 1) }),
      revealAllDraw: () => {
        const { result } = get()
        if (!result) return
        set({ drawRevealCount: result.groups.reduce((n, g) => n + g.teams.length, 0) })
      },
      advanceTimeSlot: () => {
        const { activeCupId, result, stage, slotStep, cupYear } = get()
        if (!activeCupId || !result) return
        const total = cupTotalStages(activeCupId)
        if (stage >= total) return
        const days = cupScheduleDays(result, CUP_FORMATS[activeCupId], activeCupId, cupYear ?? BASE_FINALS_YEAR)
        const day = days[stage]
        const slotCount = day ? day.slots.length : 0
        // 이 단계(하루)의 다음 시간대를 공개. 마지막 시간대를 공개하면 하루 완료 → stage 진행, slotStep 리셋.
        if (!day || slotStep + 1 >= slotCount) set({ stage: Math.min(stage + 1, total), slotStep: 0 })
        else set({ slotStep: slotStep + 1 })
      },
      advanceStage: () => {
        const { activeCupId, result, stage } = get()
        if (!activeCupId || !result) return
        set({ stage: Math.min(stage + 1, cupTotalStages(activeCupId)), slotStep: 0 })
      },
      advanceToEnd: () => {
        const { activeCupId, result } = get()
        if (!activeCupId || !result) return
        set({ stage: cupTotalStages(activeCupId), slotStep: 0 })
      },
      computeProbabilities: (iterations = CUP_PROB_ITERATIONS) => {
        const { activeCupId, hostIds, result, stage, championTrend } = get()
        if (!activeCupId || !result) return
        const field = result.groups.flatMap((g) => g.teams)
        const ratings = baseRatingsMap(field)
        const seedBase = get().seed ?? 'CUP'
        // 월드컵과 동일: 현재 공개된 결과(조별 revealedGroupMd차전·녹아웃 revealedKoRounds라운드)를 고정하고
        // 남은 경기만 반복 시뮬레이션한 '실황 반영' 확률. 완주 시 100%/0%로 수렴한다.
        const revealedGroupMd = Math.min(stage, 3)
        const revealedKoRounds = Math.max(0, stage - 3)

        const runId = ++cupProbRunId
        // 재계산 중에도 기존 확률을 화면에 유지(깜빡임 방지)하고 갱신 배지만 띄운다. 새 값은 완료 시 교체.
        set({ probLoading: true })
        if (cupProbWorker) {
          cupProbWorker.terminate()
          cupProbWorker = null
        }

        // 계산 결과(확률)를 받아 우승 확률 추이 스냅샷(단계별, dedup)을 축적하고 상태에 반영한다.
        // stage/championTrend는 디스패치 시점 값으로 고정(비동기 완료 시 stage가 바뀌어도 정합성 유지).
        const applyResult = (probabilities: CupProbabilities) => {
          if (runId !== cupProbRunId) return
          const championByTeam: Record<string, number> = {}
          for (const id of field) championByTeam[id] = probabilities.byTeam[id]?.champion ?? 0
          const trend = [...(championTrend ?? []).filter((t) => t.stage !== stage), { stage, byTeam: championByTeam }].sort((a, b) => a.stage - b.stage)
          set({ probabilities, championTrend: trend, probLoading: false })
        }

        const runOnMainThread = () => {
          const probabilities = computeCupProbabilitiesLive(CUP_FORMATS[activeCupId], result, revealedGroupMd, revealedKoRounds, ratings, hostIds, iterations, `${seedBase}-PROB-${stage}`)
          applyResult(probabilities)
        }

        // 우선 Web Worker에서 실행해 메인스레드를 막지 않는다(F). 실패 시 메인스레드로 폴백.
        if (typeof Worker !== 'undefined') {
          try {
            const worker = new Worker(new URL('../workers/cupWorker.ts', import.meta.url), { type: 'module' })
            cupProbWorker = worker
            worker.onmessage = (e: MessageEvent<CupWorkerOut>) => {
              if (runId !== cupProbRunId) return
              if (e.data.type === 'result') {
                applyResult(e.data.probabilities)
                worker.terminate()
                if (cupProbWorker === worker) cupProbWorker = null
              }
            }
            worker.onerror = () => {
              worker.terminate()
              if (cupProbWorker === worker) cupProbWorker = null
              if (runId === cupProbRunId) runOnMainThread()
            }
            worker.postMessage({ cupId: activeCupId, result, revealedGroupMd, revealedKoRounds, ratings, hostIds, iterations, seedBase: `${seedBase}-PROB-${stage}` })
            return
          } catch {
            /* 워커 생성 실패 → 메인스레드 폴백 */
          }
        }
        runOnMainThread()
      },
      reset: () => {
        cancelCupProb()
        set({ activeCupId: null, seed: null, hostIds: [], cupYear: null, qualResult: null, result: null, probabilities: null, probLoading: false, championTrend: [], stage: 0, slotStep: 0, drawRevealCount: 0 })
      },
    }),
    {
      name: 'wc2026-continental-store',
      version: 2,
      // probLoading은 순간적 UI 상태라 저장하지 않는다(새로고침 시 stale true 방지). 나머지는 그대로 저장.
      partialize: (s) => ({
        activeCupId: s.activeCupId,
        seed: s.seed,
        hostIds: s.hostIds,
        cupYear: s.cupYear,
        qualResult: s.qualResult,
        result: s.result,
        probabilities: s.probabilities,
        championTrend: s.championTrend,
        stage: s.stage,
        slotStep: s.slotStep,
        drawRevealCount: s.drawRevealCount,
      }),
    },
  ),
)
