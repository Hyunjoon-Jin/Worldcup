import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { simulateAllQualification, type AllQualificationResult } from '../engine/qualification'
import { buildQualCalendar } from '../engine/qualification/calendar'
import { createQualProbAccumulator, type StageProbabilities } from '../engine/qualification/probability'
import { buildFriendlies, type FriendlyMatch } from '../engine/qualification/friendlies'
import {
  collectPlayedByConfed,
  buildLockedLookups,
  isPartialProgress,
  flattenPlayed,
  type LockedMatchData,
} from '../engine/qualification/conditional'
import {
  initRankingPoints,
  updateRankingPoints,
  updatedRatingsFromPoints,
  overallDeltasFromResults,
} from '../engine/qualification/ranking'
import type { LockedLookup } from '../engine/qualification/generic'
import { generateSeed } from '../engine/rng'
import { getRatings } from '../engine/matchEngine'
import { getCurrentHostIds } from '../engine/hostContext'
import { usePerformanceStore } from './usePerformanceStore'
import { useCareerStore } from './useCareerStore'
import { ALL_NATIONS } from '../data/nations'
import type { TeamRatings } from '../types/team'
import type { QualWorkerOut } from '../workers/qualWorker'

/**
 * 예선 시뮬레이션에 쓸 능력치 맵을 만든다 (D1). getRatings로 컨디션·모멘텀·샌드박스 조정을
 * 반영하므로, 본선과 동일하게 샌드박스로 팀을 키우면 예선 결과에도 반영된다.
 */
function buildQualRatings(): Record<string, TeamRatings> {
  return Object.fromEntries(ALL_NATIONS.map((t) => [t.id, getRatings(t.id)]))
}

/**
 * 예선 진행 상황(실황)을 반영한 확률 계산 입력을 만든다.
 * 부분 진행이면: 이미 치른 경기를 고정(locked)하고, 그 결과로 갱신된 Elo 전력으로 남은 경기를
 * 시뮬레이션한다(조건부 확률). 전체 완료/미진행이면 무조건 확률(D1 능력치)로 계산한다.
 */
function buildProbInputs(): {
  ratings: Record<string, TeamRatings>
  locked?: Record<string, LockedMatchData[]>
  lockedByConfed?: Record<string, LockedLookup>
} {
  const result = useQualificationStore.getState().result
  const revealed = useQualificationStore.getState().revealed
  if (result && isPartialProgress(result, revealed)) {
    const locked = collectPlayedByConfed(result, revealed)
    const played = flattenPlayed(locked)
    const fieldIds = [
      ...new Set(
        Object.values(result.byConfederation).flatMap((r) => r.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId])),
      ),
    ]
    const points = updateRankingPoints(initRankingPoints(fieldIds), played)
    return { ratings: updatedRatingsFromPoints(points), locked, lockedByConfed: buildLockedLookups(locked) }
  }
  return { ratings: buildQualRatings() }
}

/**
 * 성적(진행 결과) + 커리어 폼(이전 대회 누적)에 따른 능력치 보정을 계산해 성적 보정 store에 반영한다.
 */
function syncPerformanceDeltas(result: AllQualificationResult | null, revealed: Record<string, number>): void {
  if (!result) {
    usePerformanceStore.getState().reset()
    return
  }
  const carriedForm = useCareerStore.getState().carriedForm
  const played = flattenPlayed(collectPlayedByConfed(result, revealed))
  const editionDeltas = overallDeltasFromResults(result, played)
  const combined: Record<string, number> = {}
  for (const id of new Set([...Object.keys(editionDeltas), ...Object.keys(carriedForm)])) {
    combined[id] = Math.max(-8, Math.min(8, (editionDeltas[id] ?? 0) + (carriedForm[id] ?? 0)))
  }
  usePerformanceStore.getState().setDeltas(combined)
}

/** 워커 미지원/실패 시 메인스레드 비동기 청크 폴백 (D5). */
async function runProbOnMainThread(
  runId: number,
  seedBase: string,
  ratings: Record<string, TeamRatings>,
  set: (partial: Partial<QualificationStore>) => void,
  lockedByConfed?: Record<string, LockedLookup>,
  hostIds?: string[],
): Promise<void> {
  const acc = createQualProbAccumulator(seedBase, ratings, lockedByConfed, hostIds)
  while (acc.done < PROB_ITERATIONS) {
    if (runId !== probRunId) return
    acc.runBatch(Math.min(PROB_BATCH, PROB_ITERATIONS - acc.done))
    await new Promise((r) => setTimeout(r, 0))
  }
  if (runId !== probRunId) return
  set({ probabilities: acc.result(), stageProbabilities: acc.stageResult(), probLoading: false })
}

interface QualificationStore {
  seed: string | null
  result: AllQualificationResult | null
  /** 본선 진출 확률(%) — 계산 전 null (Q5) */
  probabilities: Record<string, number> | null
  /** 예선 단계별(차수별) 진출 확률 — 계산 전 null */
  stageProbabilities: StageProbabilities | null
  probLoading: boolean
  /** 대륙별 현재까지 공개된 라운드(B1 라운드별 진행). 기본은 전체 공개. */
  revealed: Record<string, number>
  /** 예선 기간 중 열리는 친선전(평가전) — 그 경기일에 예선 경기가 없는 국가들끼리. */
  friendlies: FriendlyMatch[]
  simulate: (seed?: string) => void
  computeProbabilities: () => void
  /** 특정 대륙의 공개 라운드를 설정한다. */
  setRevealed: (confed: string, matchday: number) => void
  /** 여러 대륙의 공개 라운드를 한 번에 설정한다(일별 진행 B2). */
  setRevealedMany: (map: Record<string, number>) => void
  reset: () => void
}

/** 진출 확률 계산 반복 수(워커에서 실행하므로 상향). 신뢰구간 계산(G2)에도 쓰인다. */
export const PROB_ITERATIONS = 300
const PROB_BATCH = 15
let probRunId = 0
let probWorker: Worker | null = null

/**
 * 지역예선 진행 상태 (Q3~Q5). 6개 대륙 예선 + 대륙간 PO로 본선 48국을 확정하고(simulate),
 * 여러 시드로 반복 시뮬레이션해 본선 진출 확률을 산출한다(computeProbabilities).
 */
export const useQualificationStore = create<QualificationStore>()(
  persist(
    (set, get) => ({
      seed: null,
      result: null,
      probabilities: null,
      stageProbabilities: null,
      probLoading: false,
      revealed: {},
      friendlies: [],
      simulate: (seed) => {
        const usedSeed = seed && seed.trim() ? seed.trim().toUpperCase() : generateSeed()
        // 커리어 폼(이전 대회 흐름)을 시작 전력에 반영한 뒤, 현재 대회 개최국으로 시뮬레이션한다.
        usePerformanceStore.getState().setDeltas(useCareerStore.getState().carriedForm)
        const qualRatings = buildQualRatings()
        const result = simulateAllQualification(usedSeed, qualRatings, undefined, getCurrentHostIds())
        // 예선 기간 중 쉬는 국가들끼리 친선전(평가전)을 편성해 둔다(경기일별, 결정론적).
        const friendlies = buildFriendlies(result, qualRatings, usedSeed)
        // 첫 경기일부터 날짜별로 진행(관전)하도록, 공개 라운드를 캘린더 1일차 상태로 시작한다.
        // '⏭ 끝'으로 언제든 전체 결과로 건너뛸 수 있다.
        const calendar = buildQualCalendar(result, useCareerStore.getState().year)
        const revealed =
          calendar.length > 0
            ? calendar[0].revealedByConfed
            : Object.fromEntries(Object.entries(result.byConfederation).map(([c, r]) => [c, r.matchdays]))
        set({ seed: usedSeed, result, probabilities: null, stageProbabilities: null, revealed, friendlies })
        syncPerformanceDeltas(result, revealed)
      },
      setRevealed: (confed, matchday) => {
        set({ revealed: { ...get().revealed, [confed]: matchday } })
        syncPerformanceDeltas(get().result, get().revealed)
      },
      setRevealedMany: (map) => {
        set({ revealed: { ...get().revealed, ...map } })
        syncPerformanceDeltas(get().result, get().revealed)
      },
      computeProbabilities: () => {
        const runId = ++probRunId
        const seedBase = get().seed ?? 'PROB'
        const hostIds = getCurrentHostIds()
        // 진행 상황(실황)을 반영: 부분 진행이면 치른 경기 고정 + 갱신 전력으로 조건부 계산.
        const { ratings, locked, lockedByConfed } = buildProbInputs()
        set({ probLoading: true, probabilities: null, stageProbabilities: null })
        if (probWorker) {
          probWorker.terminate()
          probWorker = null
        }

        // 우선 Web Worker에서 실행해 메인스레드를 막지 않는다 (D5).
        if (typeof Worker !== 'undefined') {
          try {
            const worker = new Worker(new URL('../workers/qualWorker.ts', import.meta.url), { type: 'module' })
            probWorker = worker
            worker.onmessage = (e: MessageEvent<QualWorkerOut>) => {
              if (runId !== probRunId) return
              if (e.data.type === 'result') {
                set({ probabilities: e.data.probabilities, stageProbabilities: e.data.stageProbabilities, probLoading: false })
                worker.terminate()
                if (probWorker === worker) probWorker = null
              }
            }
            worker.onerror = () => {
              worker.terminate()
              if (probWorker === worker) probWorker = null
              void runProbOnMainThread(runId, seedBase, ratings, set, lockedByConfed, hostIds)
            }
            worker.postMessage({ seedBase, ratings, iterations: PROB_ITERATIONS, locked, hostIds })
            return
          } catch {
            /* 워커 생성 실패 → 메인스레드 폴백 */
          }
        }
        void runProbOnMainThread(runId, seedBase, ratings, set, lockedByConfed, hostIds)
      },
      reset: () => {
        probRunId++
        if (probWorker) {
          probWorker.terminate()
          probWorker = null
        }
        usePerformanceStore.getState().reset()
        set({ seed: null, result: null, probabilities: null, stageProbabilities: null, probLoading: false, revealed: {}, friendlies: [] })
      },
    }),
    {
      name: 'wc2026-qualification-store',
      version: 3,
      partialize: (s) => ({ seed: s.seed, result: s.result, probabilities: s.probabilities, stageProbabilities: s.stageProbabilities, revealed: s.revealed, friendlies: s.friendlies }),
      onRehydrateStorage: () => (state) => {
        // 새로고침 후 저장된 진행 상황으로 성적 반영 능력치 보정을 복원한다.
        if (state?.result) {
          syncPerformanceDeltas(state.result, state.revealed)
          // 친선전은 (결과+시드)에서 파생되므로, 예전 빌드에서 만들어진 저장본이 있어도 현재 규칙(전력 차 50위 이내)으로
          // 항상 다시 계산해 덮어쓴다. 이렇게 하면 오래된 저장 상태의 잘못된 친선전 매칭이 새로고침 시 교정된다.
          if (state.seed) {
            try {
              state.friendlies = buildFriendlies(state.result, buildQualRatings(), state.seed)
            } catch {
              /* 능력치 계산 실패 시 저장본 유지 */
            }
          }
        }
      },
    },
  ),
)
