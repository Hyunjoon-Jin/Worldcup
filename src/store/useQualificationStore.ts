import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { simulateAllQualification, type AllQualificationResult } from '../engine/qualification'
import { buildQualCalendar } from '../engine/qualification/calendar'
import { createQualProbAccumulator, type StageProbabilities } from '../engine/qualification/probability'
import { buildFriendlies, type FriendlyMatch } from '../engine/qualification/friendlies'
import { deriveQualStages, isKnockoutGroup } from '../engine/qualification/rules'
import {
  collectPlayedByConfed,
  buildLockedLookups,
  flattenPlayed,
  type LockedMatchData,
} from '../engine/qualification/conditional'
import {
  initRankingPoints,
  updateRankingPoints,
  updatedRatingsFromPoints,
  computeLiveRanking,
} from '../engine/qualification/ranking'
import { useRankHistoryStore } from './useRankHistoryStore'
import { recomputePerformanceDeltas } from './performanceActions'
import type { LockedLookup } from '../engine/qualification/generic'
import { generateSeed } from '../engine/rng'
import { getRatings } from '../engine/matchEngine'
import { getCurrentHostIds } from '../engine/hostContext'
import { usePerformanceStore } from './usePerformanceStore'
import { useCareerStore } from './useCareerStore'
import { useProgressStore } from './useProgressStore'
import { useDrawStore } from './useDrawStore'
import { useSimulationStore } from './useSimulationStore'
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

/** 이 스테이지가 '포트로 조추첨하는 조별 차수'인가(균등 크기 2개 이상 조, 녹아웃 아님). */
function isPotDrawStage(r: AllQualificationResult['byConfederation'][string], stage: { groupIndices: number[] }): boolean {
  const sizes = stage.groupIndices.map((gi) => r.groups[gi]?.length ?? 0)
  if (stage.groupIndices.length < 2 || (sizes[0] ?? 0) < 3) return false
  if (!sizes.every((n) => n === sizes[0])) return false
  return !stage.groupIndices.every((gi) => isKnockoutGroup(r, gi))
}

/** 조추첨을 진행 단계로 끼워 넣을 경기일(윈도우) 집합 = 어떤 대륙이든 포트 조추첨 차수가 시작하는 라운드. */
function computeDrawWindows(result: AllQualificationResult): Set<number> {
  const windows = new Set<number>()
  for (const r of Object.values(result.byConfederation)) {
    for (const stage of deriveQualStages(r)) {
      if (isPotDrawStage(r, stage)) windows.add(stage.startMd)
    }
  }
  return windows
}

/**
 * 지정한 경기일(윈도우)들의 '그 시점 전체 FIFA 순위'를 계산해 월별 랭킹 이력에 기록한다.
 * 각 윈도우는 캘린더 날짜(≈월)에 대응하므로, 대회 단위가 아니라 월별로 최고·최저·평균 순위를 낼 수 있다.
 */
function recordRankMonths(result: AllQualificationResult, windows: number[], calendar: ReturnType<typeof buildQualCalendar>): void {
  const valid = windows.filter((w) => w >= 1 && w <= calendar.length)
  if (valid.length === 0) return
  const base = useCareerStore.getState().rankingBase
  const carried = Object.keys(base).length > 0 ? base : undefined
  const friendlies = useQualificationStore.getState().friendlies
  const entries = valid.map((w) => {
    const revByConfed = calendar[w - 1].revealedByConfed
    const played = flattenPlayed(collectPlayedByConfed(result, revByConfed))
    // 그 시점까지 치른 친선전도 반영(대륙 무관 → 전 대륙 중 가장 앞선 경기일 기준).
    const globalRevealed = Math.max(0, ...Object.values(revByConfed))
    const playedFriendlies = friendlies.filter((f) => f.matchday <= globalRevealed)
    const rows = computeLiveRanking(result, played, { groupMatches: [], knockoutMatches: [] }, carried, playedFriendlies)
    const rankByTeam: Record<string, number> = {}
    for (const row of rows) rankByTeam[row.teamId] = row.rank
    return { date: calendar[w - 1].date, rankByTeam }
  })
  useRankHistoryStore.getState().recordMany(entries)
}

/**
 * 예선 진행 상황(실황)을 반영한 확률 계산 입력을 만든다.
 * 공개된(revealed) 경기는 진행 정도와 무관하게 '항상' 고정(locked)하고, 갱신된 Elo 전력으로 남은
 * 경기만 시뮬레이션한다:
 * - 미진행(공개 경기 0): 무조건 확률(D1 능력치).
 * - 부분 진행: 치른 경기 고정 + 남은 경기 시뮬(조건부 확률).
 * - 완전 공개(완료): 전 경기 고정 → 결정론적으로 실제 결과 재현(확정국 100%·탈락국 0%).
 * 예전엔 '완료'일 때 무조건 확률로 되돌아가, 본선 진출이 확정된 팀이 92%처럼 표시되는 모순이 있었다.
 */
export function buildProbInputs(): {
  ratings: Record<string, TeamRatings>
  locked?: Record<string, LockedMatchData[]>
  lockedByConfed?: Record<string, LockedLookup>
} {
  const result = useQualificationStore.getState().result
  const revealed = useQualificationStore.getState().revealed
  if (!result) return { ratings: buildQualRatings() }
  const locked = collectPlayedByConfed(result, revealed)
  const played = flattenPlayed(locked)
  if (played.length === 0) return { ratings: buildQualRatings() } // 아직 한 경기도 공개 전
  const fieldIds = [
    ...new Set(
      Object.values(result.byConfederation).flatMap((r) => r.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId])),
    ),
  ]
  const points = updateRankingPoints(initRankingPoints(fieldIds), played)
  return { ratings: updatedRatingsFromPoints(points), locked, lockedByConfed: buildLockedLookups(locked) }
}

/**
 * 대륙컵 통합 예선(아시안컵) 확률용 조건부 입력 — 공개된(revealed) 경기를 예선 완료 여부와 무관하게 항상
 * 고정한다. 월드컵 예선이 완료됐어도 그 대륙의 '실제 결과'를 그대로 반영해야 하므로(예: 대만이 2차 통과 =
 * 아시안컵 직행 확정 → 100%), isPartialProgress에 의존하지 않고 collectPlayedByConfed로 공개분을 전부 lock한다.
 * 완전 공개면 전 경기가 고정돼 시뮬이 실제 결과를 결정론적으로 재현한다(확정 팀 100%·탈락 0%).
 */
export function buildConfedLockedProbInputs(confed: string): { ratings: Record<string, TeamRatings>; locked?: LockedLookup } {
  const result = useQualificationStore.getState().result
  const revealed = useQualificationStore.getState().revealed
  if (!result) return { ratings: buildQualRatings() }
  const lockedAll = collectPlayedByConfed(result, revealed)
  const played = flattenPlayed(lockedAll)
  if (played.length === 0) return { ratings: buildQualRatings() }
  const fieldIds = [
    ...new Set(Object.values(result.byConfederation).flatMap((r) => r.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))),
  ]
  const points = updateRankingPoints(initRankingPoints(fieldIds), played)
  return { ratings: updatedRatingsFromPoints(points), locked: buildLockedLookups(lockedAll)[confed] }
}

/**
 * 성적→능력치 보정을 갱신한다. 실제 계산은 모든 대회(예선·본선·대륙컵)를 종합하는 중앙
 * recomputePerformanceDeltas가 담당한다(성적 반영 흐름의 단일 소유자). 예선이 없으면 초기화.
 */
function syncPerformanceDeltas(result: AllQualificationResult | null, _revealed: Record<string, number>): void {
  if (!result) {
    usePerformanceStore.getState().reset()
    return
  }
  recomputePerformanceDeltas()
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
  /** null이 아니면 이 경기일(윈도우)의 경기를 공개하기 전에 그 차수 '조추첨'을 먼저 보여주는 중이다. */
  drawPending: number | null
  simulate: (seed?: string) => void
  computeProbabilities: () => void
  /** 특정 대륙의 공개 라운드를 설정한다. */
  setRevealed: (confed: string, matchday: number) => void
  /** 여러 대륙의 공개 라운드를 한 번에 설정한다(일별 진행 B2). */
  setRevealedMany: (map: Record<string, number>) => void
  /** 하루씩 진행: 조추첨이 낀 경기일 앞에서는 먼저 조추첨을 보여주고, 다시 누르면 그 경기일을 공개한다. */
  advanceQual: () => void
  /** 남은 예선을 끝까지 공개한다(조추첨 단계 포함 모두 건너뛰기). */
  advanceQualToEnd: () => void
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
      drawPending: null,
      simulate: (seed) => {
        const usedSeed = seed && seed.trim() ? seed.trim().toUpperCase() : generateSeed()
        // 커리어 폼(이전 대회 흐름)을 시작 전력에 반영한 뒤, 현재 대회 개최국으로 시뮬레이션한다.
        usePerformanceStore.getState().setDeltas(useCareerStore.getState().carriedForm)
        const qualRatings = buildQualRatings()
        const result = simulateAllQualification(usedSeed, qualRatings, undefined, getCurrentHostIds())
        // 예선 기간 중 쉬는 국가들끼리 친선전(평가전)을 편성해 둔다(경기일별, 결정론적).
        const friendlies = buildFriendlies(result, qualRatings, usedSeed)
        // 첫 경기일부터 하루씩 진행. 이후 차수 사이(2차·3차 …)에서 advanceQual이 조추첨을 끼워 넣는다.
        const calendar = buildQualCalendar(result, useCareerStore.getState().year)
        const revealed =
          calendar.length > 0
            ? calendar[0].revealedByConfed
            : Object.fromEntries(Object.entries(result.byConfederation).map(([c, r]) => [c, r.matchdays]))
        set({ seed: usedSeed, result, probabilities: null, stageProbabilities: null, revealed, friendlies, drawPending: null })
        // 새 예선을 시작하면 이전 대회의 본선 조추첨·진행은 이 예선 결과와 무관하므로 초기화한다.
        // (초기화하지 않으면 '조추첨 하지도 않았는데 다시하기'로 표시되는 문제가 생긴다. 팀 선택은 유지.)
        useDrawStore.getState().reset()
        useProgressStore.getState().reset()
        useSimulationStore.getState().reset()
        syncPerformanceDeltas(result, revealed)
        recordRankMonths(result, [1], calendar) // 첫 경기일(월) 순위 스냅샷 기록
      },
      advanceQual: () => {
        const { result, revealed, drawPending } = get()
        if (!result) return
        const cal = buildQualCalendar(result, useCareerStore.getState().year)
        if (cal.length === 0) return
        if (drawPending != null) {
          // 조추첨을 봤으니 그 경기일 경기를 공개한다.
          const w = Math.min(drawPending, cal.length)
          const rev = cal[w - 1].revealedByConfed
          set({ revealed: rev, drawPending: null })
          syncPerformanceDeltas(result, rev)
          recordRankMonths(result, [w], cal)
          return
        }
        const cur = Math.max(0, ...Object.values(revealed))
        const next = cur + 1
        if (next > cal.length) return
        // 다음 경기일에 조추첨 차수가 시작되면, 경기 공개 전에 조추첨을 먼저 보여준다.
        if (computeDrawWindows(result).has(next)) {
          set({ drawPending: next })
        } else {
          const rev = cal[next - 1].revealedByConfed
          set({ revealed: rev, drawPending: null })
          syncPerformanceDeltas(result, rev)
          recordRankMonths(result, [next], cal)
        }
      },
      advanceQualToEnd: () => {
        const { result } = get()
        if (!result) return
        const cal = buildQualCalendar(result, useCareerStore.getState().year)
        const rev = Object.fromEntries(Object.entries(result.byConfederation).map(([c, r]) => [c, r.matchdays]))
        set({ revealed: rev, drawPending: null })
        syncPerformanceDeltas(result, rev)
        // 건너뛰어도 월별 이력이 비지 않도록 모든 경기일 스냅샷을 채운다.
        recordRankMonths(result, Array.from({ length: cal.length }, (_, i) => i + 1), cal)
      },
      setRevealed: (confed, matchday) => {
        set({ revealed: { ...get().revealed, [confed]: matchday } })
        syncPerformanceDeltas(get().result, get().revealed)
      },
      setRevealedMany: (map) => {
        set({ revealed: { ...get().revealed, ...map }, drawPending: null })
        syncPerformanceDeltas(get().result, get().revealed)
      },
      computeProbabilities: () => {
        const runId = ++probRunId
        const seedBase = get().seed ?? 'PROB'
        const hostIds = getCurrentHostIds()
        // 진행 상황(실황)을 반영: 부분 진행이면 치른 경기 고정 + 갱신 전력으로 조건부 계산.
        const { ratings, locked, lockedByConfed } = buildProbInputs()
        // 재계산 중에도 기존 확률을 그대로 두어 화면이 깜빡이지 않게 한다(자동 갱신 시 특히 중요).
        // 새 값은 계산 완료 시 교체된다(오래된 run은 runId로 무시).
        set({ probLoading: true })
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
        // 월별 랭킹 이력(useRankHistoryStore)은 대회 간 누적이므로 여기서 지우지 않는다(전체 삭제는 clearAllHistory).
        set({ seed: null, result: null, probabilities: null, stageProbabilities: null, probLoading: false, revealed: {}, friendlies: [], drawPending: null })
      },
    }),
    {
      name: 'wc2026-qualification-store',
      version: 3,
      partialize: (s) => ({ seed: s.seed, result: s.result, probabilities: s.probabilities, stageProbabilities: s.stageProbabilities, revealed: s.revealed, friendlies: s.friendlies, drawPending: s.drawPending }),
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
