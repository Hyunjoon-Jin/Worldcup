import { simulateAllQualification } from './index'
import type { TeamRatings } from '../../types/team'

/**
 * 예선 진출 확률 누적기 (지역예선 Q5). 서로 다른 시드로 전체 예선을 여러 번 시뮬레이션해
 * 각 국가가 본선(48)에 드는 빈도를 집계한다. 같은 seedBase는 같은 확률을 재현한다.
 * ratings 주입 시 그 능력치로(컨디션·샌드박스 반영, D1) 계산한다.
 */
export function createQualProbAccumulator(seedBase: string, ratings?: Record<string, TeamRatings>) {
  const counts: Record<string, number> = {}
  let done = 0
  return {
    get done() {
      return done
    },
    runBatch(n: number): void {
      for (let i = 0; i < n; i++) {
        const res = simulateAllQualification(`${seedBase}-${done + i}`, ratings)
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
