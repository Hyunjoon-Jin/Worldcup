import { describe, expect, it } from 'vitest'
import {
  computeFinalsRecord,
  roundReachedFor,
  rankMapFromPoints,
  buildEditionSnapshot,
  aggregateTeamHistory,
  type EditionRecord,
} from '../src/engine/history'
import type { GroupMatch, KnockoutMatch } from '../src/types/match'

const gm = (h: string, a: string, hg: number, ag: number): GroupMatch => ({
  homeTeamId: h,
  awayTeamId: a,
  homeGoals: hg,
  awayGoals: ag,
  group: 'A',
  matchday: 1,
})
const km = (round: KnockoutMatch['round'], h: string, a: string, hg: number, ag: number, winner: string): KnockoutMatch => ({
  round,
  slotId: `${round}-1`,
  homeTeamId: h,
  awayTeamId: a,
  homeGoals: hg,
  awayGoals: ag,
  wentToPenalties: hg === ag,
  winnerTeamId: winner,
})

describe('역대 기록 엔진 (history)', () => {
  it('본선 전적을 정규시간 스코어로 집계한다(승부차기는 무)', () => {
    const groups = [gm('KOR', 'GER', 2, 0), gm('BRA', 'KOR', 1, 1)]
    const knockouts = [km('R16', 'KOR', 'JPN', 0, 0, 'KOR')] // 승부차기 승 → 무로 집계
    const rec = computeFinalsRecord('KOR', groups, knockouts)
    expect(rec).toMatchObject({ gp: 3, w: 1, d: 2, l: 0, gf: 3, ga: 1 })
  })

  it('최종 도달 라운드: 우승/준우승/3위/4위/조별/예선탈락', () => {
    const finalMatch = km('FINAL', 'ARG', 'FRA', 3, 2, 'ARG')
    const thirdMatch = km('THIRD', 'CRO', 'MAR', 2, 1, 'CRO')
    const all = [finalMatch, thirdMatch, km('QF', 'BRA', 'CRO', 0, 0, 'CRO')]
    expect(roundReachedFor('ARG', all, 'ARG', true)).toBe('우승')
    expect(roundReachedFor('FRA', all, 'ARG', true)).toBe('준우승')
    expect(roundReachedFor('CRO', all, 'ARG', true)).toBe('3위')
    expect(roundReachedFor('MAR', all, 'ARG', true)).toBe('4위')
    expect(roundReachedFor('BRA', all, 'ARG', true)).toBe('8강') // QF에서 탈락
    expect(roundReachedFor('KOR', all, 'ARG', true)).toBe('조별리그') // 본선은 갔으나 녹아웃 없음
    expect(roundReachedFor('IND', all, 'ARG', false)).toBe('예선 탈락')
  })

  it('점수 맵을 등수로 변환한다', () => {
    const rank = rankMapFromPoints({ A: 1800, B: 1900, C: 1700 })
    expect(rank).toEqual({ B: 1, A: 2, C: 3 })
  })

  it('통산 집계: 우승 횟수·최고 성적·평균 순위·전적 합산', () => {
    const ed1 = buildEditionSnapshot({
      year: 2026,
      hostIds: ['USA'],
      champion: 'ARG',
      qualified48: ['ARG', 'FRA'],
      groupMatches: [gm('ARG', 'FRA', 2, 1)],
      knockoutMatches: [km('FINAL', 'ARG', 'FRA', 1, 0, 'ARG')],
      endPoints: { ARG: 1900, FRA: 1850 },
    })
    const ed2: EditionRecord = {
      year: 2030,
      hostIds: ['ESP'],
      champion: 'FRA',
      byTeam: {
        ARG: { qualified: true, roundReached: '8강', gp: 5, w: 3, d: 1, l: 1, gf: 8, ga: 4, rank: 3, points: 1880 },
        FRA: { qualified: true, roundReached: '우승', gp: 7, w: 6, d: 1, l: 0, gf: 14, ga: 3, rank: 1, points: 1980 },
      },
    }
    const arg = aggregateTeamHistory([ed1, ed2], 'ARG')
    expect(arg.titles).toBe(1) // 2026 우승
    expect(arg.qualifiedCount).toBe(2)
    expect(arg.bestFinish).toBe('우승')
    expect(arg.editions).toBe(2)
    // 순위 추이: 2026(ARG 2위 — FRA 1900>ARG... 실제 endPoints로 ARG 1위? ARG 1900, FRA 1850 → ARG 1위)
    expect(arg.rankTrend.map((t) => t.year)).toEqual([2026, 2030])
    expect(arg.bestRank?.rank).toBe(1)
    expect(arg.worstRank?.rank).toBe(3)
    expect(arg.avgRank).toBe(2) // (1 + 3) / 2
  })
})
