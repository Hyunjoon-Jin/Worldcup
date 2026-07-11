import { describe, expect, it } from 'vitest'
import { buildFullSchedule, buildGroupStageSchedule, buildKnockoutSchedule } from '../src/engine/scheduleEngine'

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
})
