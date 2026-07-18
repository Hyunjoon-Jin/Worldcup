import { describe, expect, it } from 'vitest'
import { computeCupQualProbabilities } from '../src/engine/continental/cupQualProbability'
import { CUP_FORMATS } from '../src/data/continental/formats'
import { baseRatingsMap, nationsByConfederation, ALL_NATIONS } from '../src/data/nations'

const ratings = baseRatingsMap(ALL_NATIONS.map((t) => t.id))
const poolOf = (id: keyof typeof CUP_FORMATS) => [...new Set(CUP_FORMATS[id].confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))]

describe('대륙컵 지역예선 진출 확률', () => {
  it('조별 예선 대회(유로): 확률 합계 ≈ 진출 슬롯 수, 결정론', () => {
    const f = CUP_FORMATS.EURO
    const p = computeCupQualProbabilities(f, ratings, [], 60, 'EURO-T')
    const sum = Object.values(p).reduce((a, b) => a + b, 0) / 100
    expect(sum).toBeGreaterThan(f.teams - 1.5)
    expect(sum).toBeLessThan(f.teams + 1.5)
    for (const v of Object.values(p)) expect(v).toBeGreaterThanOrEqual(0)
    // 결정론: 같은 시드 → 같은 결과
    const p2 = computeCupQualProbabilities(f, ratings, [], 60, 'EURO-T')
    expect(p2).toEqual(p)
  })

  it('통합 예선(아시안컵): 강팀은 진출 확률이 높고 확률 합계 ≈ 슬롯 수', () => {
    const f = CUP_FORMATS.ASIAN
    const p = computeCupQualProbabilities(f, ratings, [], 40, 'ASIAN-T')
    const sum = Object.values(p).reduce((a, b) => a + b, 0) / 100
    expect(sum).toBeGreaterThan(f.teams - 2)
    expect(sum).toBeLessThan(f.teams + 2)
    // AFC 최상위(일본/이란/한국 등)는 사실상 100%에 가깝다.
    const afc = nationsByConfederation('AFC').slice().sort((a, b) => a.fifaRankApprox - b.fifaRankApprox)
    expect(p[afc[0].id]).toBeGreaterThan(80)
  })

  it('개최국은 자동 진출로 확률 100%', () => {
    const f = CUP_FORMATS.EURO
    const uefa = nationsByConfederation('UEFA').map((t) => t.id)
    const host = uefa[uefa.length - 1] // 약체 개최국
    const p = computeCupQualProbabilities(f, ratings, [host], 30, 'EURO-HOST', {})
    expect(p[host]).toBe(100)
  })
})
