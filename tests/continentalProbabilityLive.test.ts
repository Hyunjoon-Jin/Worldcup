import { describe, expect, it } from 'vitest'
import { computeCupProbabilitiesLive } from '../src/engine/continental/cupProbability'
import { runCup } from '../src/engine/continental/runCup'
import { cupTotalStages } from '../src/store/useContinentalStore'
import { CUP_FORMATS, type CupId } from '../src/data/continental/formats'
import { nationsByConfederation, baseRatingsMap } from '../src/data/nations'

function fieldFor(cupId: CupId) {
  const f = CUP_FORMATS[cupId]
  const pool = [...new Set(f.confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))]
  const ratings = baseRatingsMap(pool)
  const teamIds = pool.sort((a, b) => ratings[b].overall - ratings[a].overall || a.localeCompare(b)).slice(0, f.teams)
  return { teamIds, ratings: baseRatingsMap(teamIds) }
}

describe('대륙컵 라이브(조건부) 확률 computeCupProbabilitiesLive', () => {
  it('아무것도 공개 안 된 시점: 우승 확률 합 ≈ 100%, 결정론', () => {
    const f = CUP_FORMATS.EURO
    const { teamIds, ratings } = fieldFor('EURO')
    const result = runCup(f, teamIds, ratings, [teamIds[0]], 'LIVE-EURO')
    const a = computeCupProbabilitiesLive(f, result, 0, 0, ratings, [teamIds[0]], 60, 'LP')
    const b = computeCupProbabilitiesLive(f, result, 0, 0, ratings, [teamIds[0]], 60, 'LP')
    expect(a.byTeam).toEqual(b.byTeam)
    const champSum = Object.values(a.byTeam).reduce((s, p) => s + p.champion, 0)
    expect(Math.round(champSum)).toBe(100)
  })

  it('완주(모든 단계 공개) 시 실제 우승팀 100%, 나머지 0% (실황에 수렴)', () => {
    for (const cupId of ['EURO', 'GOLD', 'ASIAN', 'OFC'] as CupId[]) {
      const f = CUP_FORMATS[cupId]
      const { teamIds, ratings } = fieldFor(cupId)
      const result = runCup(f, teamIds, ratings, [teamIds[0]], `DONE-${cupId}`)
      const revealedKo = cupTotalStages(cupId) - 3 // 전체 녹아웃 라운드 공개
      const prob = computeCupProbabilitiesLive(f, result, 3, revealedKo, ratings, [teamIds[0]], 30, 'DONE')
      expect(prob.byTeam[result.champion].champion).toBe(100)
      for (const id of Object.keys(prob.byTeam)) {
        if (id !== result.champion) expect(prob.byTeam[id].champion).toBe(0)
      }
    }
  })

  it('조별리그 전 경기 공개 후: 실제 조별 통과 팀은 조별통과 100%', () => {
    const f = CUP_FORMATS.EURO
    const { teamIds, ratings } = fieldFor('EURO')
    const result = runCup(f, teamIds, ratings, [teamIds[0]], 'GRP-EURO')
    const prob = computeCupProbabilitiesLive(f, result, 3, 0, ratings, [teamIds[0]], 40, 'GRP')
    const firstRound = f.knockout[0]
    for (const id of result.qualified) {
      expect(prob.byTeam[id].reach[firstRound]).toBe(100)
    }
  })
})
