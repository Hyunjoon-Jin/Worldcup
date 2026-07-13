import { describe, expect, it } from 'vitest'
import { evaluateAchievements, type AchievementContext } from '../src/engine/achievements'
import type { TournamentStats } from '../src/engine/tournamentStats'

function baseStats(over: Partial<TournamentStats> = {}): TournamentStats {
  return {
    totalMatches: 10,
    totalGoals: 20,
    avgGoalsPerMatch: 2,
    penaltyShootouts: 0,
    biggestWin: null,
    highestScoring: null,
    topScorers: [],
    bestDefense: [],
    ...over,
  }
}

function ctx(over: Partial<AchievementContext> = {}): AchievementContext {
  return {
    stats: baseStats(),
    highlights: [],
    matches: [],
    champion: null,
    myTeamId: null,
    championResults: [],
    ...over,
  }
}

const earned = (list: ReturnType<typeof evaluateAchievements>, id: string) => list.find((a) => a.id === id)?.earned

describe('evaluateAchievements (v2 #46)', () => {
  it('아무 조건도 없으면 모두 미달성', () => {
    const list = evaluateAchievements(ctx())
    expect(list.every((a) => !a.earned)).toBe(true)
  })

  it('승부차기 3회 이상이면 드라마 업적 달성', () => {
    const list = evaluateAchievements(ctx({ stats: baseStats({ penaltyShootouts: 3 }) }))
    expect(earned(list, 'shootout-drama')).toBe(true)
  })

  it('무패 우승 판정', () => {
    const list = evaluateAchievements(ctx({ champion: 'ARG', championResults: ['win', 'draw', 'win'] }))
    expect(earned(list, 'unbeaten')).toBe(true)
    const lost = evaluateAchievements(ctx({ champion: 'ARG', championResults: ['win', 'loss', 'win'] }))
    expect(earned(lost, 'unbeaten')).toBe(false)
  })

  it('언더독 우승: 랭킹 20위 밖 우승팀', () => {
    // KOR은 rank 20 → 20위 밖 아님(> 20 조건). rank 32 팀 PAN으로 확인
    expect(earned(evaluateAchievements(ctx({ champion: 'PAN' })), 'underdog')).toBe(true)
    expect(earned(evaluateAchievements(ctx({ champion: 'ARG' })), 'underdog')).toBe(false)
  })

  it('내 팀 우승 업적', () => {
    expect(earned(evaluateAchievements(ctx({ champion: 'KOR', myTeamId: 'KOR' })), 'my-glory')).toBe(true)
    expect(earned(evaluateAchievements(ctx({ champion: 'KOR', myTeamId: 'JPN' })), 'my-glory')).toBe(false)
  })
})
