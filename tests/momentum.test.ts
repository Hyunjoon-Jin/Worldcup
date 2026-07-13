import { describe, expect, it } from 'vitest'
import { collectTeamResults, computeMomentumOffsets, computeTeamMomentum } from '../src/engine/momentum'
import { MOMENTUM } from '../src/engine/config'
import type { GroupMatch, KnockoutMatch } from '../src/types/match'

describe('computeTeamMomentum (C4)', () => {
  it('연승은 양(+), 연패는 음(-)의 모멘텀을 만든다', () => {
    expect(computeTeamMomentum(['win', 'win', 'win'])).toBeGreaterThan(0)
    expect(computeTeamMomentum(['loss', 'loss', 'loss'])).toBeLessThan(0)
  })

  it('경기가 없으면 0', () => {
    expect(computeTeamMomentum([])).toBe(0)
  })

  it('모멘텀은 ±max 범위로 제한된다', () => {
    const big = computeTeamMomentum(['win', 'win', 'win', 'win', 'win'])
    expect(big).toBeLessThanOrEqual(MOMENTUM.max)
    expect(big).toBeGreaterThanOrEqual(-MOMENTUM.max)
  })

  it('최근 경기가 더 큰 가중치를 갖는다 (최근 승 > 과거 승)', () => {
    const recentWin = computeTeamMomentum(['loss', 'loss', 'win'])
    const oldWin = computeTeamMomentum(['win', 'loss', 'loss'])
    expect(recentWin).toBeGreaterThan(oldWin)
  })
})

describe('collectTeamResults / computeMomentumOffsets', () => {
  const gm = (h: string, a: string, hg: number, ag: number, md: 1 | 2 | 3): GroupMatch => ({
    group: 'A',
    matchday: md,
    homeTeamId: h,
    awayTeamId: a,
    homeGoals: hg,
    awayGoals: ag,
  })

  it('조별 경기의 승/무/패를 팀별로 시간순 집계한다', () => {
    const matches = [gm('ARG', 'BRA', 2, 0, 1), gm('ARG', 'KOR', 1, 1, 2), gm('GHA', 'ARG', 3, 0, 3)]
    const results = collectTeamResults(matches, [])
    expect(results.ARG).toEqual(['win', 'draw', 'loss'])
    expect(results.BRA).toEqual(['loss'])
    expect(results.GHA).toEqual(['win'])
  })

  it('토너먼트 결과는 승자 win / 패자 loss로 반영된다', () => {
    const ko: KnockoutMatch = {
      round: 'R32',
      slotId: 'M1',
      homeTeamId: 'ARG',
      awayTeamId: 'BRA',
      homeGoals: 0,
      awayGoals: 0,
      wentToPenalties: true,
      winnerTeamId: 'ARG',
    }
    const results = collectTeamResults([], [ko])
    expect(results.ARG).toEqual(['win'])
    expect(results.BRA).toEqual(['loss'])
  })

  it('오프셋은 팀 ID → 숫자 맵을 반환한다', () => {
    const offsets = computeMomentumOffsets([gm('ARG', 'BRA', 3, 0, 1)], [])
    expect(offsets.ARG).toBeGreaterThan(0)
    expect(offsets.BRA).toBeLessThan(0)
  })
})
