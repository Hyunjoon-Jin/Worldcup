import { describe, it, expect } from 'vitest'
import { simulateAfc } from '../src/engine/qualification/afc'
import { baseRatingsMap, nationsByConfederation } from '../src/data/nations'
import { createSeededRandom } from '../src/engine/rng'

/** 1차 예선에 편성된 팀 집합. */
function round1Teams(res: ReturnType<typeof simulateAfc>): Set<string> {
  const s = new Set<string>()
  res.groups.forEach((g, i) => {
    if (res.groupLabels[i] === '1차 예선') g.forEach((t) => s.add(t))
  })
  return s
}

describe('예선 시딩 — 이월 FIFA 순위(seedRank)로 진입 라운드가 정해진다', () => {
  const afcTeams = nationsByConfederation('AFC').map((t) => t.id)
  const ratings = baseRatingsMap(afcTeams)

  it('정적 랭킹으로는 1차 예선을 치르던 팀도, FIFA 순위가 최상위로 오르면 1차 예선을 건너뛴다', () => {
    // seedRank 없이(정적 랭킹) 1차 예선에 편성되는 하위 팀을 하나 찾는다.
    const r0 = simulateAfc(afcTeams, ratings, createSeededRandom('SEED-A'), undefined, 8)
    const before = round1Teams(r0)
    expect(before.size).toBeGreaterThan(0)
    const weak = [...before][0]

    // 그 팀에 '최상위(1위)' 이월 순위를 주면(랭킹 상승 시나리오) 1차 예선을 건너뛴다.
    const seedRank: Record<string, number> = { [weak]: 1 }
    const r1 = simulateAfc(afcTeams, ratings, createSeededRandom('SEED-A'), undefined, 8, seedRank)
    expect(round1Teams(r1).has(weak)).toBe(false)
  })

  it('같은 seedRank를 주면 결과가 결정론적으로 재현된다(확률 재현 정합성)', () => {
    const seedRank: Record<string, number> = { [afcTeams[afcTeams.length - 1]]: 1 }
    const a = simulateAfc(afcTeams, ratings, createSeededRandom('DET'), undefined, 8, seedRank)
    const b = simulateAfc(afcTeams, ratings, createSeededRandom('DET'), undefined, 8, seedRank)
    expect(a.groupLabels).toEqual(b.groupLabels)
    expect(a.groups).toEqual(b.groups)
  })
})
