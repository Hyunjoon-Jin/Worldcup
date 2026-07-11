import { describe, expect, it } from 'vitest'
import { createSeededRandom, generateSeed, shuffleWith } from '../src/engine/rng'

describe('rng — 시드 기반 결정론적 난수 (C6)', () => {
  it('같은 시드는 항상 같은 난수열을 만든다', () => {
    const a = createSeededRandom('WC2026')
    const b = createSeededRandom('WC2026')
    const seqA = Array.from({ length: 20 }, () => a())
    const seqB = Array.from({ length: 20 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('다른 시드는 (거의 항상) 다른 난수열을 만든다', () => {
    const a = Array.from({ length: 20 }, createSeededRandom('AAA-1111'))
    const b = Array.from({ length: 20 }, createSeededRandom('BBB-2222'))
    expect(a).not.toEqual(b)
  })

  it('난수는 항상 [0, 1) 범위에 있다', () => {
    const rand = createSeededRandom('range-check')
    for (let i = 0; i < 1000; i++) {
      const v = rand()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('shuffleWith는 같은 시드로 같은 순서를 재현한다', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const r1 = shuffleWith(input, createSeededRandom('seed-A'))
    const r2 = shuffleWith(input, createSeededRandom('seed-A'))
    expect(r1).toEqual(r2)
    // 원본은 불변, 요소는 보존
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect([...r1].sort((a, b) => a - b)).toEqual(input)
  })

  it('generateSeed는 읽기 쉬운 XXX-XXXX 형식을 만든다', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateSeed()).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{4}$/)
    }
  })
})
