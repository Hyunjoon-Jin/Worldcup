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
  displayPoints,
  editionEndRankingPoints,
  computeLiveRanking,
  applyInactivityDecay,
} from '../src/engine/qualification/ranking'
import { simulateAllQualification } from '../src/engine/qualification'
import { flattenPlayed, collectPlayedByConfed } from '../src/engine/qualification/conditional'

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

describe('FIFA 랭킹 — 규정 정밀화(Phase 2)', () => {
  it('A3 무감점 특례: 강팀이 약팀을 이겨도 점수는 오른다(내려가지 않음)', () => {
    const p = { STRONG: 1900, WEAK: 820 }
    applyMatchElo(p, { homeTeamId: 'STRONG', awayTeamId: 'WEAK', homeGoals: 3, awayGoals: 0 })
    expect(p.STRONG).toBeGreaterThan(1900) // 승리 시 항상 +
    expect(p.WEAK).toBeLessThan(820)
  })

  it('A3: 강팀이 약팀과 비기면 점수가 내려간다(승리 아님 — 정상 규정)', () => {
    const p = { STRONG: 1900, WEAK: 1300 }
    applyMatchElo(p, { homeTeamId: 'STRONG', awayTeamId: 'WEAK', homeGoals: 1, awayGoals: 1 })
    expect(p.STRONG).toBeLessThan(1900)
  })

  it('A4: 승부차기 승리는 정규 승리보다 적게 오르고, 패자는 감점되지 않는다', () => {
    const reg = { A: 1500, B: 1500 }
    applyMatchElo(reg, { homeTeamId: 'A', awayTeamId: 'B', homeGoals: 2, awayGoals: 0 })
    const pk = { A: 1500, B: 1500 }
    applyMatchElo(pk, { homeTeamId: 'A', awayTeamId: 'B', homeGoals: 1, awayGoals: 1, wentToPenalties: true, winnerTeamId: 'A' })
    expect(pk.A - 1500).toBeGreaterThan(0)
    expect(pk.A - 1500).toBeLessThan(reg.A - 1500) // 승부차기 승(0.75) < 정규 승(1)
    expect(pk.B).toBeCloseTo(1500, 6) // 승부차기 패(0.5) — 동점 상대라 변화 0
  })

  it('A8·F30: 동점 팀끼리 예선 승리 = 정확히 ±12.5점(I=25, W−Wₑ=0.5)', () => {
    const p = { A: 1500, B: 1500 }
    applyMatchElo(p, { homeTeamId: 'A', awayTeamId: 'B', homeGoals: 1, awayGoals: 0 })
    expect(p.A).toBeCloseTo(1512.5, 6)
    expect(p.B).toBeCloseTo(1487.5, 6)
    expect(displayPoints(p.A)).toBe(1513) // 표시용 정수 반올림
  })

  it('F30: 본선 8강(I=60), 1600이 1400을 이기면 ΔP = 60·(1−Wₑ)', () => {
    const p = { C: 1600, D: 1400 }
    const we = expectedResult(1600, 1400)
    applyMatchElo(p, { homeTeamId: 'C', awayTeamId: 'D', homeGoals: 1, awayGoals: 0 }, IMPORTANCE_WC_KO)
    expect(p.C).toBeCloseTo(1600 + 60 * (1 - we), 6)
    expect(p.D).toBeCloseTo(1400 - 60 * (1 - we), 6)
  })

  it('C17 비활동 감쇠: factor=0이면 무동작(실제 FIFA 기본)', () => {
    const p = { A: 1700, B: 1200 }
    const played = { A: 0, B: 5 }
    expect(applyInactivityDecay(p, played, 0)).toEqual(p)
  })

  it('C17 비활동 감쇠: factor>0이면 미경기 팀만 시작 점수 쪽으로 회귀', () => {
    // BRA를 인위적으로 시작 점수보다 높게 두고, 미경기(played=0)로 감쇠시킨다.
    const start = staticStartPoints('BRA')
    const p = { BRA: start + 200, ARG: start + 200 }
    const decayed = applyInactivityDecay(p, { BRA: 0, ARG: 3 }, 0.5)
    expect(decayed.BRA).toBeCloseTo(start + 100, 6) // 미경기 → 절반 회귀
    expect(decayed.ARG).toBe(start + 200) // 경기함 → 불변
  })

  it('C18: 에디션 종료 점수(editionEndRankingPoints)는 전체 공개 라이브 랭킹과 일치한다', () => {
    const all = simulateAllQualification('P2-C18')
    const revealed = Object.fromEntries(
      Object.keys(all.byConfederation).map((c) => [c, all.byConfederation[c].matchdays]),
    )
    const endPts = editionEndRankingPoints(all, { groupMatches: [], knockoutMatches: [] })
    const live = computeLiveRanking(all, flattenPlayed(collectPlayedByConfed(all, revealed)))
    // 표본 팀의 라이브 점수(반올림)와 에디션 종료 점수(반올림)가 같아야 한다.
    for (const row of live.slice(0, 5)) {
      expect(displayPoints(endPts[row.teamId])).toBe(row.points)
    }
  })
})
