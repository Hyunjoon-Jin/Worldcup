import { describe, expect, it } from 'vitest'
import { aggregateCupHonors, type CupEdition } from '../src/store/useContinentalHistoryStore'

const eds: CupEdition[] = [
  { cupId: 'EURO', seed: 'S1', champion: 'ESP', runnerUp: 'FRA', third: 'GER', qualified: ['ESP', 'FRA', 'GER', 'ITA'] },
  { cupId: 'EURO', seed: 'S2', champion: 'FRA', runnerUp: 'ESP', third: 'ENG', qualified: ['ESP', 'FRA', 'ENG', 'POR'] },
  { cupId: 'ASIAN', seed: 'S3', champion: 'JPN', runnerUp: 'KOR', third: 'IRN', qualified: ['JPN', 'KOR', 'IRN', 'AUS'] },
]

describe('대륙컵 통산 성적 집계 aggregateCupHonors (Phase D · 감사 D3)', () => {
  it('우승·준우승·3위·진출 횟수를 대회별로 집계', () => {
    const esp = aggregateCupHonors(eds, 'ESP')
    expect(esp.totalTitles).toBe(1)
    expect(esp.byCup.EURO).toEqual({ titles: 1, runnerUp: 1, third: 0, appearances: 2 })
    expect(esp.byCup.ASIAN).toBeUndefined()
  })

  it('여러 대회에 걸친 우승 합계', () => {
    const fra = aggregateCupHonors(eds, 'FRA')
    expect(fra.totalTitles).toBe(1)
    expect(fra.byCup.EURO).toEqual({ titles: 1, runnerUp: 1, third: 0, appearances: 2 })
  })

  it('진출만 하고 입상 못한 팀', () => {
    const ita = aggregateCupHonors(eds, 'ITA')
    expect(ita.totalTitles).toBe(0)
    expect(ita.byCup.EURO).toEqual({ titles: 0, runnerUp: 0, third: 0, appearances: 1 })
  })

  it('참가 이력 없는 팀은 빈 집계', () => {
    const none = aggregateCupHonors(eds, 'BRA')
    expect(none.totalTitles).toBe(0)
    expect(Object.keys(none.byCup)).toHaveLength(0)
  })
})
