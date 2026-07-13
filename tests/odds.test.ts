import { describe, expect, it } from 'vitest'
import { formatDecimalOdds, toAmericanOdds, toDecimalOdds } from '../src/engine/odds'
import { dailySeedForDate } from '../src/engine/dailyChallenge'

describe('odds 변환 (v2 #29)', () => {
  it('소수 배당은 100/확률이다', () => {
    expect(toDecimalOdds(50)).toBeCloseTo(2.0)
    expect(toDecimalOdds(25)).toBeCloseTo(4.0)
    expect(toDecimalOdds(0)).toBeNull()
  })

  it('미국식 배당: 언더독은 +, 페이버릿은 -', () => {
    expect(toAmericanOdds(40)).toBe(150) // +150
    expect(toAmericanOdds(60)).toBe(-150)
    expect(toAmericanOdds(0)).toBeNull()
    expect(toAmericanOdds(100)).toBeNull()
  })

  it('포맷은 배 단위 문자열', () => {
    expect(formatDecimalOdds(40)).toBe('2.50배')
    expect(formatDecimalOdds(0)).toBe('-')
  })
})

describe('데일리 챌린지 시드 (v2 #47)', () => {
  it('같은 날짜는 같은 시드', () => {
    const d = new Date(2026, 6, 12)
    expect(dailySeedForDate(d)).toBe('DAILY-20260712')
    expect(dailySeedForDate(new Date(2026, 6, 12))).toBe(dailySeedForDate(d))
  })

  it('다른 날짜는 다른 시드', () => {
    expect(dailySeedForDate(new Date(2026, 6, 12))).not.toBe(dailySeedForDate(new Date(2026, 6, 13)))
  })
})
