import { describe, expect, it } from 'vitest'
import { buildFullSchedule, buildGroupStageSchedule, buildKnockoutSchedule, TIME_SLOTS } from '../src/engine/scheduleEngine'

describe('scheduleEngine', () => {
  it('그룹스테이지는 12개 조 × 6경기 = 72경기, 12일에 걸쳐 편성된다', () => {
    const group = buildGroupStageSchedule()
    expect(group).toHaveLength(72)
    const days = new Set(group.map((m) => m.day))
    expect(Math.max(...days)).toBe(12)
    expect(Math.min(...days)).toBe(1)
  })

  it('토너먼트는 R32~결승/3-4위전 총 32경기를 편성한다', () => {
    const ko = buildKnockoutSchedule()
    // R32(16) + R16(8) + QF(4) + SF(2) + THIRD(1) + FINAL(1)
    expect(ko).toHaveLength(32)
    const rounds = ko.reduce<Record<string, number>>((acc, m) => {
      acc[m.round] = (acc[m.round] ?? 0) + 1
      return acc
    }, {})
    expect(rounds).toMatchObject({ R32: 16, R16: 8, QF: 4, SF: 2, THIRD: 1, FINAL: 1 })
  })

  it('buildFullSchedule는 totalGroupStageDays=12를 보고한다', () => {
    expect(buildFullSchedule().totalGroupStageDays).toBe(12)
  })

  it('조별 시간대: 4개 슬롯(21:00 포함)을 모두 활용한다 (C22)', () => {
    const group = buildGroupStageSchedule()
    const used = new Set(group.map((m) => m.timeSlot))
    for (const slot of TIME_SLOTS) expect(used.has(slot)).toBe(true)
  })

  it('조별 시간대: MD1·MD2는 조 내 두 경기가 시차 편성, MD3는 동시 편성 (C22 담합 방지)', () => {
    const group = buildGroupStageSchedule()
    const groups = [...new Set(group.map((m) => m.group))]
    for (const g of groups) {
      for (const md of [1, 2, 3] as const) {
        const slots = group.filter((m) => m.group === g && m.matchday === md).map((m) => m.timeSlot)
        expect(slots).toHaveLength(2)
        if (md === 3) expect(new Set(slots).size).toBe(1) // 최종전 동시
        else expect(new Set(slots).size).toBe(2) // 시차
      }
    }
  })

  it('토너먼트: 어떤 두 경기도 같은 날짜·시간대에 겹치지 않는다 (C24 스택 가드)', () => {
    const ko = buildKnockoutSchedule()
    const seen = new Set<string>()
    for (const m of ko) {
      const key = `${m.date} ${m.timeSlot}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })
})
