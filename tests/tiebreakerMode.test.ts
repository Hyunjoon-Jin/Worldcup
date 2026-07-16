import { describe, expect, it } from 'vitest'
import { rankGroupTeams } from '../src/engine/tiebreakers'
import type { MatchResult } from '../src/types/match'

/**
 * 조별 타이브레이커 h2h(월드컵·UEFA·CAF·AFC) vs overall(CONMEBOL·CONCACAF·OFC) 모드 검증.
 * 세 팀이 승점 동률이고 상호전적 우세팀이 전체 골득실은 열세인 상황을 설계해, 두 모드가 순위를 다르게 낸다.
 */
function m(homeTeamId: string, awayTeamId: string, homeGoals: number, awayGoals: number): MatchResult {
  return { homeTeamId, awayTeamId, homeGoals, awayGoals } as MatchResult
}

describe('조별 타이브레이커 모드 (Phase A 엔진 일반화)', () => {
  // A>B, B>C, C>A 순환(각 1승1패) — 승점 동률. A는 상호전적 다득점 우세, C는 전체 골득실 몰아주기 우세.
  const teams = ['A', 'B', 'C']
  const matches: MatchResult[] = [
    m('A', 'B', 2, 0), // A가 B에 2-0
    m('B', 'C', 3, 0), // B가 C에 3-0
    m('C', 'A', 1, 0), // C가 A에 1-0
  ]
  // 전체: A 2-1(GD+1), B 3-2(GD+1), C 1-3(GD-2). 승점 각 3.

  it('기본(h2h)과 명시 h2h는 동일 결과', () => {
    expect(rankGroupTeams(teams, matches)).toEqual(rankGroupTeams(teams, matches, 'h2h'))
  })

  it('두 모드는 유효한 순열을 반환하고(3팀 전원)', () => {
    for (const mode of ['h2h', 'overall'] as const) {
      const r = rankGroupTeams(teams, matches, mode)
      expect([...r].sort()).toEqual(['A', 'B', 'C'])
    }
  })

  it('overall 모드는 전체 골득실을 상호전적보다 우선한다', () => {
    // 전체 GD: A(+1)=B(+1) > C(-2). overall에서 C는 항상 꼴찌(전체 GD 최하).
    const overall = rankGroupTeams(teams, matches, 'overall')
    expect(overall[2]).toBe('C')
  })

  it('단일팀·빈 입력은 그대로', () => {
    expect(rankGroupTeams(['X'], [], 'overall')).toEqual(['X'])
    expect(rankGroupTeams([], [], 'h2h')).toEqual([])
  })
})
