import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { simulateAllQualification, type AllQualificationResult } from '../engine/qualification'
import { createQualProbAccumulator } from '../engine/qualification/probability'
import {
  collectPlayedByConfed,
  buildLockedLookups,
  isPartialProgress,
  flattenPlayed,
  type LockedMatchData,
} from '../engine/qualification/conditional'
import { initRankingPoints, updateRankingPoints, updatedRatingsFromPoints } from '../engine/qualification/ranking'
import type { LockedLookup } from '../engine/qualification/generic'
import { generateSeed } from '../engine/rng'
import { getRatings } from '../engine/matchEngine'
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

/** 워커 미지원/실패 시 메인스레드 비동기 청크 폴백 (D5). */
async function runProbOnMainThread(
  runId: number,
  seedBase: string,
  ratings: Record<string, TeamRatings>,
  set: (partial: Partial<QualificationStore>) => void,
  lockedByConfed?: Record<string, LockedLookup>,
): Promise<void> {
  const acc = createQualProbAccumulator(seedBase, ratings, lockedByConfed)
  while (acc.done < PROB_ITERATIONS) {
    if (runId !== probRunId) return
    acc.runBatch(Math.min(PROB_BATCH, PROB_ITERATIONS - acc.done))
    await new Promise((r) => setTimeout(r, 0))
  }
  if (runId !== probRunId) return
  set({ probabilities: acc.result(), probLoading: false })
}

interface QualificationStore {
  seed: string | null
  result: AllQualificationResult | null
  /** 본선 진출 확률(%) — 계산 전 null (Q5) */
  probabilities: Record<string, number> | null
  probLoading: boolean
  /** 대륙별 현재까지 공개된 라운드(B1 라운드별 진행). 기본은 전체 공개. */
  revealed: Record<string, number>
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
      probLoading: false,
      revealed: {},
      simulate: (seed) => {
        const usedSeed = seed && seed.trim() ? seed.trim().toUpperCase() : generateSeed()
        const result = simulateAllQualification(usedSeed, buildQualRatings())
        // 기본은 전체 라운드 공개(기존 UX 유지). "처음부터 관전"으로 되돌릴 수 있다.
        const revealed = Object.fromEntries(Object.entries(result.byConfederation).map(([c, r]) => [c, r.matchdays]))
        set({ seed: usedSeed, result, probabilities: null, revealed })
      },
      setRevealed: (confed, matchday) => set({ revealed: { ...get().revealed, [confed]: matchday } }),
      setRevealedMany: (map) => set({ revealed: { ...get().revealed, ...map } }),
      computeProbabilities: () => {
        const runId = ++probRunId
        const seedBase = get().seed ?? 'PROB'
        // 진행 상황(실황)을 반영: 부분 진행이면 치른 경기 고정 + 갱신 전력으로 조건부 계산.
        const { ratings, locked, lockedByConfed } = buildProbInputs()
        set({ probLoading: true, probabilities: null })
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
                set({ probabilities: e.data.probabilities, probLoading: false })
                worker.terminate()
                if (probWorker === worker) probWorker = null
              }
            }
            worker.onerror = () => {
              worker.terminate()
              if (probWorker === worker) probWorker = null
              void runProbOnMainThread(runId, seedBase, ratings, set, lockedByConfed)
            }
            worker.postMessage({ seedBase, ratings, iterations: PROB_ITERATIONS, locked })
            return
          } catch {
            /* 워커 생성 실패 → 메인스레드 폴백 */
          }
        }
        void runProbOnMainThread(runId, seedBase, ratings, set, lockedByConfed)
      },
      reset: () => {
        probRunId++
        if (probWorker) {
          probWorker.terminate()
          probWorker = null
        }
        set({ seed: null, result: null, probabilities: null, probLoading: false, revealed: {} })
      },
    }),
    {
      name: 'wc2026-qualification-store',
      version: 3,
      partialize: (s) => ({ seed: s.seed, result: s.result, probabilities: s.probabilities, revealed: s.revealed }),
    },
  ),
)
