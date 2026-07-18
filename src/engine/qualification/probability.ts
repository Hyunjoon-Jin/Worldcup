import { simulateAllQualification } from './index'
import { stageNameOfGroup, stageOrderOfResult } from './rules'
import type { LockedLookup } from './generic'
import type { TeamRatings } from '../../types/team'

/** 예선 단계별 진출 확률. 팀별로 각 차수 '도달' 확률 + 본선진출·대륙간PO 확률(%). */
export interface StageProbabilities {
  /** teamId -> { [차수 이름]: 도달%, '본선진출': %, '대륙간PO'?: % } */
  byTeam: Record<string, Record<string, number>>
  /** 대륙 -> 차수 이름 순서(표시용) */
  stageOrderByConfed: Record<string, string[]>
}

export const QUALIFY_KEY = '본선진출'
export const INTER_PLAYOFF_KEY = '대륙간PO'

/**
 * 예선 진출 확률 누적기 (지역예선 Q5). 서로 다른 시드로 전체 예선을 여러 번 시뮬레이션해
 * 각 국가가 본선(48)에 드는 빈도 + 각 예선 차수에 도달하는 빈도를 집계한다. 같은 seedBase는
 * 같은 확률을 재현한다. ratings 주입 시 그 능력치로(컨디션·샌드박스·예선 폼 반영) 계산한다.
 * lockedByConfed 주입 시 이미 치른 경기는 고정하고 남은 경기만 시뮬레이션한다(조건부 확률 — 예선 실황 반영).
 */
export function createQualProbAccumulator(
  seedBase: string,
  ratings?: Record<string, TeamRatings>,
  lockedByConfed?: Record<string, LockedLookup>,
  hostIds?: string[],
  seedRank?: Record<string, number>,
) {
  const counts: Record<string, number> = {}
  // 차수 도달 집계: teamId -> 차수이름 -> 횟수
  const stageCounts: Record<string, Record<string, number>> = {}
  const playoffCounts: Record<string, number> = {}
  const stageOrderByConfed: Record<string, string[]> = {}
  let done = 0

  // 예선에 참가하는 회원국 전체를 0%로 미리 등록한다. 그래야 한 번도 진출하지 못한 국가도
  // 확률 대시보드에 (0%로) 표시된다 — 진출국만 보여주는 게 아니라 회원군 전체를 보여준다.
  const seedUniverse = (res: ReturnType<typeof simulateAllQualification>): void => {
    for (const r of Object.values(res.byConfederation)) {
      for (const m of r.matches) {
        counts[m.homeTeamId] ??= 0
        counts[m.awayTeamId] ??= 0
      }
    }
    for (const id of res.hosts) counts[id] ??= 0
  }

  const tallyStages = (res: ReturnType<typeof simulateAllQualification>): void => {
    for (const [confed, r] of Object.entries(res.byConfederation)) {
      // 차수 순서는 여러 시드에 걸쳐 합집합으로 누적한다(첫 시드에서 5차 PO 등이 없을 수 있으므로).
      const order = stageOrderByConfed[confed] ?? (stageOrderByConfed[confed] = [])
      for (const name of stageOrderOfResult(r)) if (!order.includes(name)) order.push(name)
      // '도달' = 그 차수의 경기에 실제 출전(홈/원정). 조 편성 목록이 승자만 담는 녹아웃 예비라운드
      // (AFC·CONCACAF 1차, AFC 5차)에서도 참가 자체를 정확히 집계한다(승률과 혼동 방지).
      const reachedThisSim: Record<string, Set<string>> = {}
      for (const m of r.matches) {
        const stage = stageNameOfGroup(r, m.group)
        for (const t of [m.homeTeamId, m.awayTeamId]) {
          const set = reachedThisSim[t] ?? (reachedThisSim[t] = new Set())
          set.add(stage)
        }
      }
      for (const [t, set] of Object.entries(reachedThisSim)) {
        const rec = stageCounts[t] ?? (stageCounts[t] = {})
        for (const stage of set) rec[stage] = (rec[stage] ?? 0) + 1
      }
      for (const id of r.playoff) playoffCounts[id] = (playoffCounts[id] ?? 0) + 1
    }
  }

  return {
    get done() {
      return done
    },
    runBatch(n: number): void {
      for (let i = 0; i < n; i++) {
        const res = simulateAllQualification(`${seedBase}-${done + i}`, ratings, lockedByConfed, hostIds, seedRank)
        if (done + i === 0) seedUniverse(res)
        for (const id of res.qualified48) counts[id] = (counts[id] ?? 0) + 1
        tallyStages(res)
      }
      done += n
    },
    result(): Record<string, number> {
      const out: Record<string, number> = {}
      const divisor = Math.max(1, done)
      for (const [id, c] of Object.entries(counts)) out[id] = (c / divisor) * 100
      return out
    },
    /** 단계별(차수별) 도달 확률 + 본선진출·대륙간PO 확률. */
    stageResult(): StageProbabilities {
      const divisor = Math.max(1, done)
      const byTeam: Record<string, Record<string, number>> = {}
      // universe = counts 키(회원국 전체) ∪ stageCounts 키
      const ids = new Set<string>([...Object.keys(counts), ...Object.keys(stageCounts)])
      for (const id of ids) {
        const o: Record<string, number> = {}
        const rec = stageCounts[id] ?? {}
        for (const [stage, c] of Object.entries(rec)) o[stage] = (c / divisor) * 100
        o[QUALIFY_KEY] = ((counts[id] ?? 0) / divisor) * 100
        if (playoffCounts[id]) o[INTER_PLAYOFF_KEY] = (playoffCounts[id] / divisor) * 100
        byTeam[id] = o
      }
      return { byTeam, stageOrderByConfed }
    },
  }
}
