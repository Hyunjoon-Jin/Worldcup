import { describe, expect, it } from 'vitest'
import { runCup, drawCupGroups } from '../src/engine/continental/runCup'
import { CUP_FORMATS, ALL_CUP_IDS, knockoutEntrants, type CupId } from '../src/data/continental/formats'
import { nationsByConfederation, baseRatingsMap } from '../src/data/nations'
import { createSeededRandom } from '../src/engine/rng'

/** 포맷의 참가 연맹에서 필요한 팀 수만큼 상위 랭킹 팀을 뽑아 참가국 필드를 만든다(테스트용). */
function fieldFor(cupId: CupId): { teamIds: string[]; ratings: ReturnType<typeof baseRatingsMap> } {
  const f = CUP_FORMATS[cupId]
  const pool = f.confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id))
  const ratings = baseRatingsMap(pool)
  // 랭킹(능력치) 상위 f.teams개 선발(결정론적)
  const teamIds = [...new Set(pool)]
    .sort((a, b) => (ratings[b].overall - ratings[a].overall) || a.localeCompare(b))
    .slice(0, f.teams)
  return { teamIds, ratings: baseRatingsMap(teamIds) }
}

describe('대륙컵 제네릭 엔진 runCup (Phase A)', () => {
  it('모든 대회가 정확한 팀수로 조추첨된다(조당 균등)', () => {
    for (const id of ALL_CUP_IDS) {
      const f = CUP_FORMATS[id]
      const { teamIds, ratings } = fieldFor(id)
      const groups = drawCupGroups(f, teamIds, ratings, createSeededRandom(`${id}-DRAW`))
      expect(groups).toHaveLength(f.groups)
      for (const g of groups) expect(g).toHaveLength(f.teamsPerGroup)
      expect(groups.flat().sort()).toEqual([...teamIds].sort()) // 전원 배정, 중복 없음
    }
  })

  it('각 대회를 완주하고 우승/준우승/조별통과 수가 규정과 일치', () => {
    for (const id of ALL_CUP_IDS) {
      const f = CUP_FORMATS[id]
      const { teamIds, ratings } = fieldFor(id)
      const res = runCup(f, teamIds, ratings, [teamIds[0]], `SEED-${id}`)
      // 조별 통과 = 조직행 + 최고3위 = 첫 녹아웃 진입 규모
      expect(res.qualified).toHaveLength(knockoutEntrants(f))
      expect(new Set(res.qualified).size).toBe(res.qualified.length) // 중복 없음
      // 우승·준우승은 진출팀 중 하나
      expect(res.qualified).toContain(res.champion)
      expect(res.qualified).toContain(res.runnerUp)
      expect(res.champion).not.toBe(res.runnerUp)
      // 3위전 유무
      if (f.thirdPlace) expect(res.third).not.toBeNull()
      else expect(res.third).toBeNull()
      // 녹아웃 경기 수 = 첫라운드 매치 + ... + 결승 (+3위전)
      const koMatchCount = knockoutEntrants(f) - 1 + (f.thirdPlace ? 1 : 0)
      expect(res.knockout).toHaveLength(koMatchCount)
    }
  })

  it('결정론적: 같은 시드 → 같은 우승자', () => {
    for (const id of ALL_CUP_IDS) {
      const f = CUP_FORMATS[id]
      const { teamIds, ratings } = fieldFor(id)
      const a = runCup(f, teamIds, ratings, [teamIds[0]], `DET-${id}`)
      const b = runCup(f, teamIds, ratings, [teamIds[0]], `DET-${id}`)
      expect(a.champion).toBe(b.champion)
      expect(a.knockout.map((m) => m.result.winnerTeamId)).toEqual(b.knockout.map((m) => m.result.winnerTeamId))
    }
  })

  it('24팀 대회: 첫 녹아웃(R16)에서 같은 조 팀끼리 재대결하지 않는다', () => {
    for (const id of ['EURO', 'AFCON', 'ASIAN'] as const) {
      const f = CUP_FORMATS[id]
      const { teamIds, ratings } = fieldFor(id)
      const res = runCup(f, teamIds, ratings, [teamIds[0]], `R16-${id}`)
      const groupOf = new Map<string, number>()
      res.groups.forEach((g) => g.teams.forEach((t) => groupOf.set(t, g.groupIndex)))
      const r16 = res.knockout.filter((m) => m.round === 'R16')
      expect(r16).toHaveLength(8)
      for (const m of r16) {
        expect(groupOf.get(m.homeTeamId)).not.toBe(groupOf.get(m.awayTeamId))
      }
    }
  })

  it('teams 길이 불일치는 에러', () => {
    const f = CUP_FORMATS.EURO
    const { ratings } = fieldFor('EURO')
    expect(() => runCup(f, ['A', 'B'], ratings, [], 'X')).toThrow()
  })
})
