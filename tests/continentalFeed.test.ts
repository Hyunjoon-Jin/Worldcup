import { describe, it, expect, beforeEach } from 'vitest'
import { useContinentalStore } from '../src/store/useContinentalStore'
import { cupScheduleDays } from '../src/engine/continental/cupSchedule'
import { CUP_FORMATS } from '../src/data/continental/formats'

/**
 * 결과 피드 배치 재구성 — ContinentalProgressView의 feed 계산과 동일하게, lastRevealFrom(방금 공개한
 * 배치 시작 커서)부터 현재 커서(stage, slotStep)까지의 시간대 슬롯만 모은다.
 */
function batchSlots() {
  const { result, activeCupId, cupYear, stage, slotStep, lastRevealFrom } = useContinentalStore.getState()
  if (!lastRevealFrom || !result || !activeCupId) return []
  const days = cupScheduleDays(result, CUP_FORMATS[activeCupId], activeCupId, cupYear ?? 2026)
  const shown: (typeof days)[number]['slots'] = []
  for (let d = lastRevealFrom.day; d <= stage && d < days.length; d++) {
    const day = days[d]
    const start = d === lastRevealFrom.day ? lastRevealFrom.slot : 0
    const end = d < stage ? day.slots.length : slotStep
    shown.push(...day.slots.slice(start, end))
  }
  return shown
}

describe('대륙컵 결과 피드 — 시간대별(누적 금지)', () => {
  beforeEach(() => useContinentalStore.getState().reset())

  it('새 대회를 시작하면 lastRevealFrom은 null(피드 없음)', () => {
    const s = useContinentalStore.getState()
    s.selectCup('ASIAN', 2027)
    s.runActiveCup({ seed: 'FEED-TEST' })
    expect(useContinentalStore.getState().lastRevealFrom).toBeNull()
    expect(batchSlots()).toEqual([])
  })

  it('시간대 진행 시 피드는 그 시간대 하나만 담는다(연속 진행해도 누적되지 않음)', () => {
    const s = useContinentalStore.getState()
    s.selectCup('ASIAN', 2027)
    s.runActiveCup({ seed: 'FEED-TEST' })
    s.advanceTimeSlot()
    expect(batchSlots().length).toBe(1)
    // 다시 진행 — 여전히 '방금 그 시간대' 하나만(이전 시간대 누적 X)
    useContinentalStore.getState().advanceTimeSlot()
    expect(batchSlots().length).toBe(1)
    useContinentalStore.getState().advanceTimeSlot()
    expect(batchSlots().length).toBe(1)
  })

  it('하루 전체 진행 시 피드는 그 하루의 남은 시간대 전부를 담는다', () => {
    const s = useContinentalStore.getState()
    s.selectCup('ASIAN', 2027)
    s.runActiveCup({ seed: 'FEED-TEST2' })
    const days = cupScheduleDays(useContinentalStore.getState().result!, CUP_FORMATS.ASIAN, 'ASIAN', 2027)
    s.advanceStage() // day 0(그룹 Day 1) 전체 공개
    expect(batchSlots().length).toBe(days[0].slots.length)
    expect(batchSlots().length).toBeGreaterThan(1) // 하루엔 여러 시간대가 있다
  })
})
