import { describe, expect, it } from 'vitest'
import { marginOfError95 } from '../src/engine/confidence'

describe('marginOfError95 (v2 #27)', () => {
  it('반복수가 많을수록 오차가 작아진다', () => {
    const small = marginOfError95(50, 100)
    const large = marginOfError95(50, 10000)
    expect(large).toBeLessThan(small)
  })

  it('p=50%에서 오차가 가장 크고 극단(0/100%)에서 작다', () => {
    const mid = marginOfError95(50, 1000)
    const edge = marginOfError95(2, 1000)
    expect(mid).toBeGreaterThan(edge)
  })

  it('n=1000, p=50%의 95% 오차는 약 3.1%p', () => {
    expect(marginOfError95(50, 1000)).toBeCloseTo(3.1, 1)
  })

  it('반복수 0이면 0', () => {
    expect(marginOfError95(50, 0)).toBe(0)
  })
})
