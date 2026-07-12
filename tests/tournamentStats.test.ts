import { describe, expect, it } from 'vitest'
import { computeTournamentStats, type StatMatch } from '../src/engine/tournamentStats'
import { computeHighlights } from '../src/engine/highlights'

const sm = (h: string, a: string, hg: number, ag: number, label = '조별 MD1 · 조 A', pen = false): StatMatch => ({
  homeTeamId: h,
  awayTeamId: a,
  homeGoals: hg,
  awayGoals: ag,
  label,
  wentToPenalties: pen,
})

describe('computeTournamentStats (D6)', () => {
  it('총 경기·총 득점·평균을 집계한다', () => {
    const s = computeTournamentStats([sm('A', 'B', 2, 1), sm('C', 'D', 0, 0)])
    expect(s.totalMatches).toBe(2)
    expect(s.totalGoals).toBe(3)
    expect(s.avgGoalsPerMatch).toBeCloseTo(1.5)
  })

  it('최다 득점차/최다 득점 경기와 승부차기 수를 찾는다', () => {
    const matches = [sm('A', 'B', 5, 0), sm('C', 'D', 3, 3, '8강', true), sm('E', 'F', 4, 4)]
    const s = computeTournamentStats(matches)
    expect(s.biggestWin?.homeGoals).toBe(5) // 5-0 완승
    expect(s.highestScoring?.homeGoals).toBe(4) // 4-4 = 8골
    expect(s.penaltyShootouts).toBe(1)
  })

  it('다득점 팀과 무실점 팀을 정렬한다', () => {
    const s = computeTournamentStats([sm('A', 'B', 3, 0), sm('A', 'C', 2, 0)])
    expect(s.topScorers[0]).toEqual({ teamId: 'A', goals: 5 })
    expect(s.bestDefense[0].teamId).toBe('A')
    expect(s.bestDefense[0].cleanSheets).toBe(2)
  })

  it('빈 목록은 0으로 처리한다', () => {
    const s = computeTournamentStats([])
    expect(s.totalMatches).toBe(0)
    expect(s.avgGoalsPerMatch).toBe(0)
    expect(s.biggestWin).toBeNull()
  })
})

describe('computeHighlights (D5)', () => {
  const ratingOf = (id: string) => ({ overall: id === 'STRONG' ? 90 : id === 'WEAK' ? 60 : 75 })

  it('약팀이 강팀을 이기면 이변으로 최상위에 온다', () => {
    const hs = computeHighlights([sm('WEAK', 'STRONG', 1, 0)], ratingOf)
    expect(hs[0].type).toBe('upset')
    expect(hs[0].winnerTeamId).toBe('WEAK')
  })

  it('대량 득점차/난타전/승부차기를 분류한다', () => {
    const hs = computeHighlights(
      [sm('M1', 'M2', 5, 0), sm('M3', 'M4', 4, 3), sm('M5', 'M6', 1, 1, '결승', true)],
      ratingOf,
    )
    const types = hs.map((h) => h.type)
    expect(types).toContain('rout')
    expect(types).toContain('thriller')
    expect(types).toContain('penalty')
  })

  it('중요도순으로 정렬되고 limit로 잘린다', () => {
    const many = Array.from({ length: 20 }, (_, i) => sm(`H${i}`, `A${i}`, 5, 0))
    const hs = computeHighlights(many, ratingOf, 5)
    expect(hs).toHaveLength(5)
  })
})
