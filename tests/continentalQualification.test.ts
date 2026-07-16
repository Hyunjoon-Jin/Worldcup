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
    for (const id of ['EURO', 'AFCON', 'ASIAN', 'GOLD'] as const) {
      const f = CUP_FORMATS[id]
      const res = runCupQualification(f, ratings, [], `BIG-${id}`)
      const poolSize = f.confeds.flatMap((c) => nationsByConfederation(c)).length
      expect(poolSize).toBeGreaterThan(f.teams) // 후보 > 슬롯
      expect(res.groups.length).toBeGreaterThan(0) // 실제 예선 발생
      expect(res.qualified.length).toBeLessThan(poolSize) // 탈락자 존재
    }
  })

  it('결정론: 같은 시드 → 같은 참가국', () => {
    const f = CUP_FORMATS.AFCON
    const a = runCupQualification(f, ratings, [], 'DET')
    const b = runCupQualification(f, ratings, [], 'DET')
    expect(a.qualified).toEqual(b.qualified)
  })
})
