import { describe, expect, it } from 'vitest'
import {
  MATCH_IMPORTANCE,
  IMPORTANCE_QUALIFIER,
  IMPORTANCE_WC_GROUP,
  IMPORTANCE_WC_KO,
  RANKING_CONSTANTS,
  wcKnockoutImportance,
  expectedResult,
  applyMatchElo,
  basePointsFromRank,
  effectiveRankFromPoints,
  staticStartPoints,
  initRankingPoints,
  resolveBasePoints,
} from '../src/engine/qualification/ranking'

describe('FIFA 랭킹 — 중요도 계수(A1·A5)', () => {
  it('중요도 표가 실제 FIFA 규정값을 담는다', () => {
    expect(MATCH_IMPORTANCE.friendlyOutsideWindow).toBe(5)
    expect(MATCH_IMPORTANCE.friendlyInWindow).toBe(10)
    expect(MATCH_IMPORTANCE.nationsLeagueGroup).toBe(15)
    expect(MATCH_IMPORTANCE.qualifier).toBe(25)
    expect(MATCH_IMPORTANCE.continentalGroup).toBe(35)
    expect(MATCH_IMPORTANCE.continentalKnockout).toBe(40)
    expect(MATCH_IMPORTANCE.worldCupGroup).toBe(50)
    expect(MATCH_IMPORTANCE.worldCupKnockout).toBe(60)
  })
  it('공개 상수는 중요도 표를 단일 출처로 참조한다', () => {
    expect(IMPORTANCE_QUALIFIER).toBe(MATCH_IMPORTANCE.qualifier)
    expect(IMPORTANCE_WC_GROUP).toBe(MATCH_IMPORTANCE.worldCupGroup)
    expect(IMPORTANCE_WC_KO).toBe(MATCH_IMPORTANCE.worldCupKnockout)
  })
  it('본선 라운드별 중요도: 8강부터 60, 그 전 50', () => {
    expect(wcKnockoutImportance('R32')).toBe(50)
    expect(wcKnockoutImportance('R16')).toBe(50)
    expect(wcKnockoutImportance('QF')).toBe(60)
    expect(wcKnockoutImportance('FINAL')).toBe(60)
  })
})

describe('FIFA 랭킹 — SUM 공식(F29)', () => {
  it('기대 승점: 동점이면 0.5, 우세하면 >0.5, 열세하면 <0.5', () => {
    expect(expectedResult(1500, 1500)).toBeCloseTo(0.5, 6)
    expect(expectedResult(1700, 1300)).toBeGreaterThan(0.5)
    expect(expectedResult(1300, 1700)).toBeLessThan(0.5)
    // 대칭성: We(a,b) + We(b,a) = 1
    expect(expectedResult(1700, 1300) + expectedResult(1300, 1700)).toBeCloseTo(1, 6)
  })

  it('정규 결과는 제로섬(두 팀 점수 변화 합 = 0)', () => {
    const p = { A: 1500, B: 1500 }
    const before = p.A + p.B
    applyMatchElo(p, { homeTeamId: 'A', awayTeamId: 'B', homeGoals: 2, awayGoals: 0 })
    expect(p.A + p.B).toBeCloseTo(before, 6)
    expect(p.A).toBeGreaterThan(1500)
    expect(p.B).toBeLessThan(1500)
  })

  it('승부차기(연장 무승부 후)는 W 0.75/0.5로 양팀 모두 상승 가능', () => {
    const p = { A: 1500, B: 1500 }
    applyMatchElo(p, { homeTeamId: 'A', awayTeamId: 'B', homeGoals: 1, awayGoals: 1, wentToPenalties: true, winnerTeamId: 'A' })
    // 동점 팀끼리 We=0.5. 승자 W=0.75 → +, 패자 W=0.5 → 변화 0. 둘 다 감점 아님.
    expect(p.A).toBeGreaterThan(1500)
    expect(p.B).toBeCloseTo(1500, 6)
  })

  it('중요도가 클수록 같은 결과의 점수 변동이 크다', () => {
    const q = { A: 1500, B: 1500 }
    applyMatchElo(q, { homeTeamId: 'A', awayTeamId: 'B', homeGoals: 1, awayGoals: 0 }, IMPORTANCE_QUALIFIER)
    const w = { A: 1500, B: 1500 }
    applyMatchElo(w, { homeTeamId: 'A', awayTeamId: 'B', homeGoals: 1, awayGoals: 0 }, IMPORTANCE_WC_KO)
    expect(w.A - 1500).toBeGreaterThan(q.A - 1500)
  })

  it('점수 맵에 없는 팀이 포함된 경기는 무시된다(방어)', () => {
    const p: Record<string, number> = { A: 1500 }
    applyMatchElo(p, { homeTeamId: 'A', awayTeamId: 'Z', homeGoals: 3, awayGoals: 0 })
    expect(p.A).toBe(1500) // 상대(Z) 점수가 없으면 미적용
  })
})

describe('FIFA 랭킹 — 시작 점수(A2·B12)', () => {
  it('basePointsFromRank과 effectiveRankFromPoints는 서로 역함수다', () => {
    for (const rank of [1, 10, 50, 100, 200]) {
      const pts = basePointsFromRank(rank)
      expect(effectiveRankFromPoints(pts)).toBeCloseTo(rank, 6)
    }
  })
  it('상수는 단일 출처(RANKING_CONSTANTS)에서 온다', () => {
    expect(basePointsFromRank(0)).toBe(RANKING_CONSTANTS.topPoints)
    expect(basePointsFromRank(100000)).toBe(RANKING_CONSTANTS.floorPoints) // 하한 클램프
  })
  it('staticStartPoints: 알 수 없는 팀은 100위 근사로 방어한다', () => {
    expect(staticStartPoints('__UNKNOWN__')).toBe(basePointsFromRank(100))
  })
  it('실재 팀은 순위 근사 시작 점수를 갖는다', () => {
    const p = initRankingPoints(['BRA', 'ARG'])
    expect(p['BRA']).toBeGreaterThan(RANKING_CONSTANTS.floorPoints)
    expect(p['ARG']).toBeGreaterThan(RANKING_CONSTANTS.floorPoints)
  })
  it('resolveBasePoints: 이월 점수가 있으면 우선한다', () => {
    const carried = { BRA: 1999 }
    const p = resolveBasePoints(['BRA', 'ARG'], carried)
    expect(p['BRA']).toBe(1999) // 이월 우선
    expect(p['ARG']).toBe(staticStartPoints('ARG')) // 없으면 정적
  })
})
