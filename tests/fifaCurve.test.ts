import { describe, it, expect } from 'vitest'
import { basePointsFromRank, effectiveRankFromPoints, RANKING_CONSTANTS } from '../src/engine/qualification/ranking'

/**
 * C: FIFA 점수 곡선 리얼리즘 — 시작 점수 곡선이 실제 FIFA 포인트 분포처럼 볼록(상위권 급락·하위권 완만)이고,
 * basePointsFromRank ↔ effectiveRankFromPoints가 정확한 역함수임을 보장한다.
 */
describe('FIFA 점수 곡선(C)', () => {
  it('단조 감소: 순위가 낮아질수록 점수가 낮아진다', () => {
    let prev = Infinity
    for (let r = 1; r <= 210; r++) {
      const p = basePointsFromRank(r)
      expect(p).toBeLessThanOrEqual(prev)
      prev = p
    }
  })

  it('볼록: 상위권 랭킹당 점수 격차가 하위권보다 크다(선형이 아님)', () => {
    const topGap = (basePointsFromRank(1) - basePointsFromRank(11)) / 10
    const midGap = (basePointsFromRank(100) - basePointsFromRank(110)) / 10
    const tailGap = (basePointsFromRank(190) - basePointsFromRank(200)) / 10
    expect(topGap).toBeGreaterThan(midGap)
    expect(midGap).toBeGreaterThan(tailGap)
  })

  it('실제 포인트 앵커 근사: #1은 상한, 상위권은 촘촘, 하위권은 하한 근처', () => {
    expect(basePointsFromRank(1)).toBeCloseTo(RANKING_CONSTANTS.topPoints, 6)
    expect(basePointsFromRank(10)).toBeGreaterThan(1750) // 상위권은 여전히 높다
    expect(basePointsFromRank(50)).toBeGreaterThan(1400)
    expect(basePointsFromRank(50)).toBeLessThan(1600)
    expect(basePointsFromRank(206)).toBeLessThan(850) // 최하위는 하한 근처
  })

  it('경계 클램프: rank≤1→top, 아주 큰 rank→floor', () => {
    expect(basePointsFromRank(0)).toBe(RANKING_CONSTANTS.topPoints)
    expect(basePointsFromRank(-5)).toBe(RANKING_CONSTANTS.topPoints)
    expect(basePointsFromRank(100000)).toBe(RANKING_CONSTANTS.floorPoints)
  })

  it('정확한 역함수: rank→points→rank 왕복이 일치한다', () => {
    for (const rank of [1, 3, 10, 25, 50, 100, 150, 200]) {
      expect(effectiveRankFromPoints(basePointsFromRank(rank))).toBeCloseTo(rank, 6)
    }
  })

  it('상한 초과 점수는 1위로, 하한 미만은 최하위로 클램프된다', () => {
    expect(effectiveRankFromPoints(RANKING_CONSTANTS.topPoints + 500)).toBe(1)
    expect(effectiveRankFromPoints(RANKING_CONSTANTS.floorPoints - 500)).toBeCloseTo(RANKING_CONSTANTS.totalRanks, 6)
  })
})
