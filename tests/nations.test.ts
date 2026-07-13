import { describe, expect, it } from 'vitest'
import { ALL_NATIONS, nationsByConfederation } from '../src/data/nations'
import { simulateAllQualification } from '../src/engine/qualification'

describe('참가국 로스터 확충', () => {
  it('국가 ID는 중복이 없다', () => {
    const ids = ALL_NATIONS.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('단일 스테이지 대륙이 실제 회원국 수에 근접한다', () => {
    expect(nationsByConfederation('UEFA').length).toBe(54)
    expect(nationsByConfederation('CAF').length).toBe(54)
    expect(nationsByConfederation('CONMEBOL').length).toBe(10)
    expect(nationsByConfederation('OFC').length).toBe(11)
  })

  it('CAF는 9개 조 6팀으로 채워진다(실제 2026 포맷)', () => {
    const all = simulateAllQualification('ROSTER')
    const sizes = all.byConfederation.CAF.groups.map((g) => g.length)
    expect(sizes).toHaveLength(9)
    for (const s of sizes) expect(s).toBe(6)
  })

  it('국가를 늘려도 본선 진출은 정확히 48개국(중복 없음)이다', () => {
    for (const seed of ['R1', 'R2', 'R3']) {
      const all = simulateAllQualification(seed)
      expect(all.qualified48).toHaveLength(48)
      expect(new Set(all.qualified48).size).toBe(48)
    }
  })
})
