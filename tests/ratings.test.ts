import { describe, expect, it } from 'vitest'
import { TEAMS, TEAMS_BY_ID } from '../src/data/teams'
import { RATINGS_FROM_RANK as R } from '../src/engine/config'

describe('능력치 곡선 (C1)', () => {
  it('FIFA 랭킹이 낮을수록(숫자가 클수록) overall이 단조 비증가한다', () => {
    const byRank = [...TEAMS].sort((a, b) => a.fifaRankApprox - b.fifaRankApprox)
    for (let i = 1; i < byRank.length; i++) {
      expect(byRank[i].baseRatings.overall).toBeLessThanOrEqual(byRank[i - 1].baseRatings.overall)
    }
  })

  it('모든 overall은 [floor, cap] 범위 안에 있다', () => {
    for (const t of TEAMS) {
      expect(t.baseRatings.overall).toBeGreaterThanOrEqual(R.overallFloor)
      expect(t.baseRatings.overall).toBeLessThanOrEqual(R.overallCap)
    }
  })

  it('상위권(1~10위)은 좁게 밀집하고 하위권과 격차가 크다', () => {
    const top = TEAMS.filter((t) => t.fifaRankApprox <= 10).map((t) => t.baseRatings.overall)
    const topSpread = Math.max(...top) - Math.min(...top)
    // 상위 10팀의 overall 편차는 작아야 한다(밀집)
    expect(topSpread).toBeLessThan(12)
    // 1위와 최하위의 격차는 상위권 내부 편차보다 훨씬 크다
    const best = TEAMS_BY_ID.ARG.baseRatings.overall
    const worst = Math.min(...TEAMS.map((t) => t.baseRatings.overall))
    expect(best - worst).toBeGreaterThan(topSpread * 2)
  })
})
