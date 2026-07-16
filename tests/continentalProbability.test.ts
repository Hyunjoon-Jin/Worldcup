import { describe, expect, it } from 'vitest'
import { computeCupProbabilities } from '../src/engine/continental/cupProbability'
import { CUP_FORMATS, type CupId } from '../src/data/continental/formats'
import { nationsByConfederation, baseRatingsMap } from '../src/data/nations'

function fieldFor(cupId: CupId) {
  const f = CUP_FORMATS[cupId]
  const pool = [...new Set(f.confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))]
  const ratings = baseRatingsMap(pool)
  const teamIds = pool.sort((a, b) => ratings[b].overall - ratings[a].overall || a.localeCompare(b)).slice(0, f.teams)
  return { teamIds, ratings: baseRatingsMap(teamIds) }
}

describe('대륙컵 확률 computeCupProbabilities (Phase A·확률 요구사항)', () => {
  it('우승 확률 합계 ≈ 100%, 조별통과 합계 = 진출팀 수 × 100%', () => {
    const f = CUP_FORMATS.EURO
    const { teamIds, ratings } = fieldFor('EURO')
    const prob = computeCupProbabilities(f, teamIds, ratings, [teamIds[0]], 60, 'PROB-EURO')
    const champSum = Object.values(prob.byTeam).reduce((s, p) => s + p.champion, 0)
    expect(Math.round(champSum)).toBe(100)
    const qualSum = Object.values(prob.byTeam).reduce((s, p) => s + p.qualify, 0)
    // 조별 통과 팀 수 = 조직행 + 최고3위 = 16 → 합계 1600%
    expect(Math.round(qualSum)).toBe(1600)
  })

  it('각 확률은 0~100 범위, 우승 ≤ 도달 ≤ 조별통과(단조)', () => {
    const f = CUP_FORMATS.GOLD
    const { teamIds, ratings } = fieldFor('GOLD')
    const prob = computeCupProbabilities(f, teamIds, ratings, [teamIds[0]], 60, 'PROB-GOLD')
    for (const id of teamIds) {
      const p = prob.byTeam[id]
      expect(p.qualify).toBeGreaterThanOrEqual(0)
      expect(p.qualify).toBeLessThanOrEqual(100)
      expect(p.champion).toBeLessThanOrEqual(p.qualify + 1e-9)
      // 결승 도달 ≥ 우승
      expect((p.reach.FINAL ?? 0)).toBeGreaterThanOrEqual(p.champion - 1e-9)
    }
  })

  it('강팀(최상위 시드)의 우승 확률이 최약체보다 높다', () => {
    const f = CUP_FORMATS.ASIAN
    const { teamIds, ratings } = fieldFor('ASIAN')
    const prob = computeCupProbabilities(f, teamIds, ratings, [teamIds[0]], 80, 'PROB-ASIAN')
    const strongest = teamIds[0]
    const weakest = teamIds[teamIds.length - 1]
    expect(prob.byTeam[strongest].champion).toBeGreaterThan(prob.byTeam[weakest].champion)
  })

  it('결정론: 같은 시드 → 같은 확률', () => {
    const f = CUP_FORMATS.OFC
    const { teamIds, ratings } = fieldFor('OFC')
    const a = computeCupProbabilities(f, teamIds, ratings, [teamIds[0]], 40, 'DET')
    const b = computeCupProbabilities(f, teamIds, ratings, [teamIds[0]], 40, 'DET')
    expect(a.byTeam).toEqual(b.byTeam)
  })
})
