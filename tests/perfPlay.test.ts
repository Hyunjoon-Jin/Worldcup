import { describe, it, expect } from 'vitest'
import { overallDeltasFromPlay, MATCH_IMPORTANCE } from '../src/engine/continental/../qualification/ranking'

describe('overallDeltasFromPlay — 대회 무관 매 경기 반영', () => {
  it('친선전만 치러도 승/패에 따라 능력치가 오르내린다', () => {
    // 약체가 강체를 여러 번 이기면(이변) 능력치가 오른다.
    const wins = Array.from({ length: 6 }, () => ({ homeTeamId: 'GUM', awayTeamId: 'JPN', homeGoals: 2, awayGoals: 0 }))
    const d = overallDeltasFromPlay([{ matches: wins, importance: MATCH_IMPORTANCE.friendlyInWindow }])
    expect((d['GUM'] ?? 0)).toBeGreaterThan(0)
    expect((d['JPN'] ?? 0)).toBeLessThan(0)
  })

  it('중요도가 높은 대회일수록(본선>친선) 같은 결과의 반영폭이 크다', () => {
    const one = (imp: number) => overallDeltasFromPlay([{ matches: [{ homeTeamId: 'GUM', awayTeamId: 'BRA', homeGoals: 1, awayGoals: 0 }], importance: imp }])
    const fr = one(MATCH_IMPORTANCE.friendlyInWindow)['GUM'] ?? 0
    const wc = one(MATCH_IMPORTANCE.worldCupKnockout)['GUM'] ?? 0
    expect(wc).toBeGreaterThanOrEqual(fr)
  })
})
