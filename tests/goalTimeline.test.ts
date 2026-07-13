import { describe, expect, it } from 'vitest'
import { formatGoalMinute, generateGoalTimeline } from '../src/engine/goalTimeline'

describe('generateGoalTimeline (C5)', () => {
  it('총 골 수만큼 이벤트를 만든다', () => {
    const tl = generateGoalTimeline('ARG', 'BRA', 2, 1)
    expect(tl).toHaveLength(3)
    expect(tl.filter((e) => e.teamId === 'ARG')).toHaveLength(2)
    expect(tl.filter((e) => e.teamId === 'BRA')).toHaveLength(1)
  })

  it('같은 경기는 항상 같은 타임라인을 재현한다', () => {
    const a = generateGoalTimeline('ARG', 'BRA', 3, 2)
    const b = generateGoalTimeline('ARG', 'BRA', 3, 2)
    expect(a).toEqual(b)
  })

  it('분(minute) 오름차순으로 정렬되고 1~95 범위 안에 있다', () => {
    const tl = generateGoalTimeline('FRA', 'ESP', 4, 3)
    for (let i = 1; i < tl.length; i++) expect(tl[i].minute).toBeGreaterThanOrEqual(tl[i - 1].minute)
    for (const e of tl) {
      expect(e.minute).toBeGreaterThanOrEqual(1)
      expect(e.minute).toBeLessThanOrEqual(95)
    }
  })

  it('무득점 경기는 빈 타임라인', () => {
    expect(generateGoalTimeline('A', 'B', 0, 0)).toEqual([])
  })

  it('formatGoalMinute는 추가시간을 90+n으로 표기한다', () => {
    expect(formatGoalMinute({ minute: 45, teamId: 'A', stoppage: false })).toBe("45'")
    expect(formatGoalMinute({ minute: 93, teamId: 'A', stoppage: true })).toBe("90+3'")
  })
})
