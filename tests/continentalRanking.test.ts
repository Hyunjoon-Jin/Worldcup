import { describe, expect, it } from 'vitest'
import { runCup, cupToRankingResults } from '../src/engine/continental/runCup'
import { applyContinentalElo } from '../src/engine/qualification/ranking'
import { CUP_FORMATS, ALL_CUP_IDS, knockoutEntrants } from '../src/data/continental/formats'
import { nationsByConfederation, baseRatingsMap } from '../src/data/nations'
import { initRankingPoints } from '../src/engine/qualification/ranking'

function fieldFor(id: (typeof ALL_CUP_IDS)[number]) {
  const f = CUP_FORMATS[id]
  const pool = [...new Set(f.confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))]
  const ratings = baseRatingsMap(pool)
  const teamIds = pool.sort((a, b) => ratings[b].overall - ratings[a].overall || a.localeCompare(b)).slice(0, f.teams)
  return { teamIds, ratings: baseRatingsMap(teamIds) }
}

describe('대륙컵 FIFA 랭킹 반영 (Phase D · 감사 D2)', () => {
  it('반영=played 불변식: 추출 경기 수 = 조별 전 경기 + 녹아웃 전 경기 (누락 없음)', () => {
    for (const id of ALL_CUP_IDS) {
      const f = CUP_FORMATS[id]
      const { teamIds, ratings } = fieldFor(id)
      const res = runCup(f, teamIds, ratings, [], `ELO-${id}`)
      const cr = cupToRankingResults(res)
      const totalGroup = res.groups.reduce((n, g) => n + g.matches.length, 0)
      expect(cr.groupMatches).toHaveLength(totalGroup)
      expect(cr.knockoutMatches).toHaveLength(res.knockout.length)
      // 녹아웃 경기 수 = 진입-1 (+3위전)
      expect(cr.knockoutMatches).toHaveLength(knockoutEntrants(f) - 1 + (f.thirdPlace ? 1 : 0))
    }
  })

  it('applyContinentalElo는 참가팀 점수를 갱신하고 비참가팀은 불변', () => {
    const f = CUP_FORMATS.EURO
    const { teamIds, ratings } = fieldFor('EURO')
    const res = runCup(f, teamIds, ratings, [], 'ELO-EURO')
    const cr = cupToRankingResults(res)
    // 참가팀 + 외부 팀 하나 포함한 점수 맵
    const outsider = nationsByConfederation('AFC')[0].id
    const points = initRankingPoints([...teamIds, outsider])
    const before = { ...points }
    applyContinentalElo(points, cr)
    // 우승팀 점수는 (경기를 여럿 이겨) 시작보다 상승
    expect(points[res.champion]).toBeGreaterThan(before[res.champion])
    // 대회 미참가 외부 팀은 불변
    expect(points[outsider]).toBe(before[outsider])
    // 제로섬 근사: 전체 참가팀 점수 변화 합은 0에 가깝다(승부차기 제외 정규경기 제로섬)
    const delta = teamIds.reduce((s, id) => s + (points[id] - before[id]), 0)
    expect(Math.abs(delta)).toBeLessThan(60) // PK 비제로섬 여지만큼만 허용
  })

  it('결정론: 같은 시드 → 같은 랭킹 반영', () => {
    const f = CUP_FORMATS.GOLD
    const { teamIds, ratings } = fieldFor('GOLD')
    const a = cupToRankingResults(runCup(f, teamIds, ratings, [], 'DET'))
    const b = cupToRankingResults(runCup(f, teamIds, ratings, [], 'DET'))
    const pa = initRankingPoints(teamIds)
    const pb = initRankingPoints(teamIds)
    applyContinentalElo(pa, a)
    applyContinentalElo(pb, b)
    expect(pa).toEqual(pb)
  })
})
