import { simulateAllQualification } from './index'
import type { LockedLookup } from './generic'
import type { TeamRatings } from '../../types/team'

/**
 * 예선 진출 확률 누적기 (지역예선 Q5). 서로 다른 시드로 전체 예선을 여러 번 시뮬레이션해
 * 각 국가가 본선(48)에 드는 빈도를 집계한다. 같은 seedBase는 같은 확률을 재현한다.
 * ratings 주입 시 그 능력치로(컨디션·샌드박스·예선 폼 반영) 계산한다.
 * lockedByConfed 주입 시 이미 치른 경기는 고정하고 남은 경기만 시뮬레이션한다(조건부 확률 — 예선 실황 반영).
 */
export function createQualProbAccumulator(
  seedBase: string,
  ratings?: Record<string, TeamRatings>,
  lockedByConfed?: Record<string, LockedLookup>,
  hostIds?: string[],
) {
  const counts: Record<string, number> = {}
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

  return {
    get done() {
      return done
    },
    runBatch(n: number): void {
      for (let i = 0; i < n; i++) {
        const res = simulateAllQualification(`${seedBase}-${done + i}`, ratings, lockedByConfed, hostIds)
        if (done + i === 0) seedUniverse(res)
        for (const id of res.qualified48) counts[id] = (counts[id] ?? 0) + 1
      }
      done += n
    },
    result(): Record<string, number> {
      const out: Record<string, number> = {}
      const divisor = Math.max(1, done)
      for (const [id, c] of Object.entries(counts)) out[id] = (c / divisor) * 100
      return out
    },
  }
}
