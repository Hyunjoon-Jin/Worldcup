import { describe, it, expect } from 'vitest'
import { computeHeadToHead, summarizeHeadToHead, type H2HInputMatch } from '../src/engine/h2h'

describe('상대전적 집계(E)', () => {
  it('상대별로 묶어 승·무·패·득실을 집계한다', () => {
    const matches: H2HInputMatch[] = [
      { competition: 'qual', homeTeamId: 'A', awayTeamId: 'B', homeGoals: 2, awayGoals: 0 }, // A 승
      { competition: 'qual', homeTeamId: 'B', awayTeamId: 'A', homeGoals: 1, awayGoals: 1 }, // 무
      { competition: 'friendly', homeTeamId: 'A', awayTeamId: 'C', homeGoals: 0, awayGoals: 3 }, // A 패
    ]
    const recs = computeHeadToHead('A', matches)
    const vsB = recs.find((r) => r.opponentId === 'B')!
    expect(vsB.played).toBe(2)
    expect(vsB.wins).toBe(1)
    expect(vsB.draws).toBe(1)
    expect(vsB.losses).toBe(0)
    expect(vsB.goalsFor).toBe(3) // 2 + 1
    expect(vsB.goalsAgainst).toBe(1) // 0 + 1
    const vsC = recs.find((r) => r.opponentId === 'C')!
    expect(vsC.losses).toBe(1)
    expect(vsC.goalsFor).toBe(0)
    expect(vsC.goalsAgainst).toBe(3)
  })

  it('원정 경기도 팀 관점으로 올바르게 집계한다', () => {
    const matches: H2HInputMatch[] = [
      { competition: 'qual', homeTeamId: 'B', awayTeamId: 'A', homeGoals: 0, awayGoals: 2 }, // A(원정) 승
    ]
    const vsB = computeHeadToHead('A', matches)[0]
    expect(vsB.wins).toBe(1)
    expect(vsB.goalsFor).toBe(2)
    expect(vsB.goalsAgainst).toBe(0)
    expect(vsB.games[0].isHome).toBe(false)
  })

  it('winnerTeamId가 있는 결착 경기(녹아웃)는 동점이어도 승자로 승/패를 가른다', () => {
    const matches: H2HInputMatch[] = [
      { competition: 'wc', homeTeamId: 'A', awayTeamId: 'B', homeGoals: 1, awayGoals: 1, wentToPenalties: true, winnerTeamId: 'A' },
    ]
    const vsB = computeHeadToHead('A', matches)[0]
    expect(vsB.wins).toBe(1)
    expect(vsB.draws).toBe(0)
    expect(vsB.games[0].wentToPenalties).toBe(true)
    // 패자 관점
    const forB = computeHeadToHead('B', matches)[0]
    expect(forB.losses).toBe(1)
  })

  it('winnerTeamId가 없으면 동점은 무승부로 집계한다', () => {
    const matches: H2HInputMatch[] = [{ competition: 'cup', homeTeamId: 'A', awayTeamId: 'B', homeGoals: 2, awayGoals: 2 }]
    expect(computeHeadToHead('A', matches)[0].draws).toBe(1)
  })

  it('팀이 참가하지 않은 경기는 무시한다', () => {
    const matches: H2HInputMatch[] = [{ competition: 'qual', homeTeamId: 'X', awayTeamId: 'Y', homeGoals: 1, awayGoals: 0 }]
    expect(computeHeadToHead('A', matches)).toEqual([])
  })

  it('맞대결이 많은 상대 순으로 정렬한다', () => {
    const matches: H2HInputMatch[] = [
      { competition: 'qual', homeTeamId: 'A', awayTeamId: 'B', homeGoals: 1, awayGoals: 0 },
      { competition: 'qual', homeTeamId: 'A', awayTeamId: 'B', homeGoals: 0, awayGoals: 0 },
      { competition: 'friendly', homeTeamId: 'A', awayTeamId: 'C', homeGoals: 1, awayGoals: 1 },
    ]
    const recs = computeHeadToHead('A', matches)
    expect(recs[0].opponentId).toBe('B') // 2경기
    expect(recs[1].opponentId).toBe('C') // 1경기
  })

  it('통산 요약이 모든 상대 합계를 낸다', () => {
    const matches: H2HInputMatch[] = [
      { competition: 'qual', homeTeamId: 'A', awayTeamId: 'B', homeGoals: 2, awayGoals: 0 },
      { competition: 'friendly', homeTeamId: 'C', awayTeamId: 'A', homeGoals: 1, awayGoals: 1 },
    ]
    const s = summarizeHeadToHead(computeHeadToHead('A', matches))
    expect(s.opponents).toBe(2)
    expect(s.played).toBe(2)
    expect(s.wins).toBe(1)
    expect(s.draws).toBe(1)
    expect(s.goalsFor).toBe(3)
    expect(s.goalsAgainst).toBe(1)
  })
})
