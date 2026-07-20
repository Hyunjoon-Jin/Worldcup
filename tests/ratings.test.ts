import { describe, expect, it } from 'vitest'
import { TEAMS, TEAMS_BY_ID, ratingsFromRank } from '../src/data/teams'
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

  it('하위권도 전 순위에 걸쳐 차별화된다(G1 — floor로 뭉개지지 않음)', () => {
    // 예전엔 totalRanks=48이라 rank>55가 전부 floor(48)로 동일했다. 이제 곡선이 전체 순위(206)에
    // 걸쳐 펼쳐져, 하위권 사이에도 실력 차가 뚜렷해야 한다.
    expect(ratingsFromRank(60).overall).toBeGreaterThan(ratingsFromRank(100).overall)
    expect(ratingsFromRank(100).overall).toBeGreaterThan(ratingsFromRank(150).overall)
    expect(ratingsFromRank(150).overall).toBeGreaterThan(ratingsFromRank(200).overall)
    // rank 100과 rank 200의 격차가 의미 있게 크다(동일 48이 아님).
    expect(ratingsFromRank(100).overall - ratingsFromRank(200).overall).toBeGreaterThan(10)
  })
})
