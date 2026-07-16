import { describe, expect, it } from 'vitest'
import { runCupQualification } from '../src/engine/continental/cupQualification'
import { CUP_FORMATS, ALL_CUP_IDS } from '../src/data/continental/formats'
import { nationsByConfederation, baseRatingsMap, ALL_NATIONS } from '../src/data/nations'

const ratings = baseRatingsMap(ALL_NATIONS.map((t) => t.id))

describe('대륙컵 예선 runCupQualification (Phase C)', () => {
  it('모든 대회가 정확히 teams개 참가국을 확정(중복 없음)', () => {
    for (const id of ALL_CUP_IDS) {
      const f = CUP_FORMATS[id]
      const res = runCupQualification(f, ratings, [], `QUAL-${id}`)
      expect(res.qualified).toHaveLength(f.teams)
      expect(new Set(res.qualified).size).toBe(f.teams)
    }
  })

  it('개최국은 자동 진출', () => {
    const f = CUP_FORMATS.EURO
    const uefa = nationsByConfederation('UEFA').map((t) => t.id)
    const weakHost = uefa[uefa.length - 1]
    const res = runCupQualification(f, ratings, [weakHost], 'HOST')
    expect(res.autoQualified).toContain(weakHost)
    expect(res.qualified).toContain(weakHost)
  })

  it('코파: CONMEBOL 10개국 전원 자동 진출, CONCACAF는 예선', () => {
    const f = CUP_FORMATS.COPA
    const res = runCupQualification(f, ratings, [], 'COPA-Q')
    const conmebol = new Set(nationsByConfederation('CONMEBOL').map((t) => t.id))
    for (const id of conmebol) expect(res.autoQualified).toContain(id)
    // 예선 조가 생겼고(초청 경쟁), 통과국은 CONCACAF
    expect(res.groups.length).toBeGreaterThan(0)
    const concacaf = new Set(nationsByConfederation('CONCACAF').map((t) => t.id))
    for (const id of res.earned) expect(concacaf.has(id)).toBe(true)
    expect(res.qualified).toHaveLength(16)
  })

  it('큰 연맹은 예선에서 탈락자가 발생(전원 통과 아님)', () => {
    // ASIAN(통합 예선)·GOLD(네이션스리그)는 별도 예선 조가 없으므로 제외.
    for (const id of ['EURO', 'AFCON'] as const) {
      const f = CUP_FORMATS[id]
      const res = runCupQualification(f, ratings, [], `BIG-${id}`)
      const poolSize = f.confeds.flatMap((c) => nationsByConfederation(c)).length
      expect(poolSize).toBeGreaterThan(f.teams) // 후보 > 슬롯
      expect(res.groups.length).toBeGreaterThan(0) // 실제 예선 발생
      expect(res.qualified.length).toBeLessThan(poolSize) // 탈락자 존재
    }
  })

  it('네이션스리그 예선(골드컵)은 상위 직행 + 하위 프렐림 플레이오프로 진출국을 가린다', () => {
    const f = CUP_FORMATS.GOLD
    const res = runCupQualification(f, ratings, [], 'NL-GOLD')
    expect(res.groups).toHaveLength(0) // 조별 예선 아님
    expect(res.qualified).toHaveLength(f.teams)
    expect(new Set(res.qualified).size).toBe(f.teams)
    const concacafTeams = nationsByConfederation('CONCACAF')
    const concacaf = concacafTeams.map((t) => t.id)
    for (const id of res.qualified) expect(concacaf).toContain(id)
    // 상위권(리그 A)은 직행 — CONCACAF 최상위 랭킹 팀은 반드시 포함된다.
    const bestRanked = [...concacafTeams].sort((a, b) => a.fifaRankApprox - b.fifaRankApprox)[0].id
    expect(res.qualified).toContain(bestRanked)
    // 결정론
    const b = runCupQualification(f, ratings, [], 'NL-GOLD')
    expect(res.qualified).toEqual(b.qualified)
  })

  it('통합 예선(combinedWcq: 아시안컵)은 별도 예선 없이 월드컵 예선 랭킹으로 진출국을 가린다', () => {
    const f = CUP_FORMATS.ASIAN
    const afc = nationsByConfederation('AFC').map((t) => t.id)
    // 월드컵 예선에서 하위권이던 팀 3개를 강하게 끌어올리면(랭킹 -1000) 아시안컵 본선에 반드시 든다.
    const boosted = afc.slice(-3)
    const rankByTeam: Record<string, number> = {}
    for (const id of boosted) rankByTeam[id] = -1000
    const res = runCupQualification(f, ratings, [], 'COMBINED', rankByTeam)
    expect(res.groups).toHaveLength(0) // 별도 예선 조 없음(통합 캠페인)
    expect(res.qualified).toHaveLength(f.teams)
    for (const id of boosted) expect(res.qualified).toContain(id)
  })

  it('결정론: 같은 시드 → 같은 참가국', () => {
    const f = CUP_FORMATS.AFCON
    const a = runCupQualification(f, ratings, [], 'DET')
    const b = runCupQualification(f, ratings, [], 'DET')
    expect(a.qualified).toEqual(b.qualified)
  })
})
