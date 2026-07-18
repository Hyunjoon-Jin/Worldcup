import { describe, it, expect } from 'vitest'
import { overallDeltasFromPlay, formNudgeDeltasFromPlay, MATCH_IMPORTANCE } from '../src/engine/continental/../qualification/ranking'

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

describe('formNudgeDeltasFromPlay — 결과 기반 최근 폼(강팀이 약팀 이겨도 움직임)', () => {
  it('강팀이 약팀을 이겨 Elo 변동이 0에 수렴해도, 승리 자체로 폼이 오른다', () => {
    // 강팀(브라질)이 약체(괌)를 여러 번 이기면 Elo 점수 변동은 미미(0에 수렴)하지만,
    // 결과 기반 폼은 연승을 +로 잡아 능력치가 오르내리는 감각을 준다.
    const wins = Array.from({ length: 5 }, () => ({ homeTeamId: 'BRA', awayTeamId: 'GUM', homeGoals: 3, awayGoals: 0 }))
    const elo = overallDeltasFromPlay([{ matches: wins, importance: MATCH_IMPORTANCE.qualifier }])
    const form = formNudgeDeltasFromPlay([{ matches: wins }])
    expect(elo['BRA'] ?? 0).toBeLessThanOrEqual(1) // Elo로는 거의 안 움직임
    expect(form['BRA'] ?? 0).toBeGreaterThan(0) // 폼으로는 확실히 상승
  })

  it('연패하면 폼이 내려가고, 최근 경기가 더 크게 반영된다', () => {
    // 4패 뒤 마지막에 1승 → 최근 승이 폼을 끌어올려 순수 연패보다 덜 내려간다.
    const losses = Array.from({ length: 4 }, () => ({ homeTeamId: 'KOR', awayTeamId: 'BRA', homeGoals: 0, awayGoals: 2 }))
    const pureLoss = formNudgeDeltasFromPlay([{ matches: losses }])['KOR'] ?? 0
    const recover = formNudgeDeltasFromPlay([{ matches: [...losses, { homeTeamId: 'KOR', awayTeamId: 'BRA', homeGoals: 1, awayGoals: 0 }] }])['KOR'] ?? 0
    expect(pureLoss).toBeLessThan(0)
    expect(recover).toBeGreaterThan(pureLoss)
  })
})
