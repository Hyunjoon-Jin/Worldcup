import { describe, expect, it } from 'vitest'
import { selectCupParticipants } from '../src/engine/continental/participants'
import { CUP_FORMATS, ALL_CUP_IDS } from '../src/data/continental/formats'
import { ALL_NATIONS_BY_ID, nationsByConfederation } from '../src/data/nations'

describe('대륙컵 참가국 선정 selectCupParticipants (Phase A)', () => {
  it('모든 대회가 정확히 teams개, 중복 없음', () => {
    for (const id of ALL_CUP_IDS) {
      const f = CUP_FORMATS[id]
      const field = selectCupParticipants(f)
      expect(field).toHaveLength(f.teams)
      expect(new Set(field).size).toBe(f.teams)
    }
  })

  it('개최국이 필드에 포함된다', () => {
    const f = CUP_FORMATS.EURO
    const uefa = nationsByConfederation('UEFA').map((t) => t.id)
    // 랭킹상 하위권 개최국을 강제로 넣어도 포함돼야 한다
    const weakHost = [...uefa].sort((a, b) => (ALL_NATIONS_BY_ID[b].fifaRankApprox) - (ALL_NATIONS_BY_ID[a].fifaRankApprox))[0]
    const field = selectCupParticipants(f, {}, [weakHost])
    expect(field).toContain(weakHost)
    expect(field).toHaveLength(f.teams)
  })

  it('코파: CONMEBOL 10개국 전원 + CONCACAF 초청으로 16 구성', () => {
    const f = CUP_FORMATS.COPA
    const field = selectCupParticipants(f)
    const conmebol = new Set(nationsByConfederation('CONMEBOL').map((t) => t.id))
    const inField = field.filter((id) => conmebol.has(id))
    expect(inField).toHaveLength(10) // CONMEBOL 전원
    expect(field).toHaveLength(16)
    // 나머지 6은 CONCACAF
    const concacaf = new Set(nationsByConfederation('CONCACAF').map((t) => t.id))
    expect(field.filter((id) => concacaf.has(id))).toHaveLength(6)
  })

  it('단일 연맹 대회는 그 연맹에서만 선발(랭킹 상위)', () => {
    const f = CUP_FORMATS.ASIAN
    const afc = new Set(nationsByConfederation('AFC').map((t) => t.id))
    const field = selectCupParticipants(f)
    for (const id of field) expect(afc.has(id)).toBe(true)
  })

  it('실시간 랭킹을 넘기면 그 순위로 선발이 바뀐다', () => {
    const f = CUP_FORMATS.GOLD
    const concacaf = nationsByConfederation('CONCACAF').map((t) => t.id)
    // 특정 약체를 1위로 끌어올리면 필드에 포함
    const underdog = [...concacaf].sort((a, b) => ALL_NATIONS_BY_ID[b].fifaRankApprox - ALL_NATIONS_BY_ID[a].fifaRankApprox)[0]
    const withoutBoost = selectCupParticipants(f)
    const boosted = selectCupParticipants(f, { [underdog]: 1 })
    if (!withoutBoost.includes(underdog)) {
      expect(boosted).toContain(underdog)
    }
    expect(boosted).toHaveLength(f.teams)
  })
})
