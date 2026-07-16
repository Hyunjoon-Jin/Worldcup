import { describe, expect, it } from 'vitest'
import {
  dateForGroupStageDay,
  roundDateWindow,
  shiftFinalsYear,
  GROUP_STAGE_DAYS,
  GROUP_STAGE_START,
  GROUP_STAGE_END,
} from '../src/data/calendar'
import { buildQualCalendar } from '../src/engine/qualification/calendar'
import { buildFullSchedule } from '../src/engine/scheduleEngine'
import { simulateAllQualification } from '../src/engine/qualification'

describe('본선 조별리그 날짜 매핑 (C21)', () => {
  it('1일차는 시작일, 마지막 진행일은 선언된 종료일과 일치한다', () => {
    expect(dateForGroupStageDay(1)).toBe(GROUP_STAGE_START)
    expect(dateForGroupStageDay(GROUP_STAGE_DAYS)).toBe(GROUP_STAGE_END)
  })
  it('진행일이 늘수록 날짜가 단조 증가한다(휴식일 포함 분산)', () => {
    let prev = ''
    for (let d = 1; d <= GROUP_STAGE_DAYS; d++) {
      const cur = dateForGroupStageDay(d)
      expect(cur >= prev).toBe(true)
      prev = cur
    }
  })
})

describe('본선 일정 연도 파라미터화 (Phase 0.1)', () => {
  it('기본 연도(2026)는 기존과 동일', () => {
    expect(dateForGroupStageDay(1)).toBe('2026-06-11')
    expect(roundDateWindow('FINAL').start).toBe('2026-07-19')
    expect(shiftFinalsYear('2026-06-11', 2026)).toBe('2026-06-11')
  })
  it('연도를 넘기면 월/일 유지한 채 연도만 이동한다', () => {
    expect(dateForGroupStageDay(1, 2030)).toBe('2030-06-11')
    expect(dateForGroupStageDay(GROUP_STAGE_DAYS, 2030)).toBe('2030-06-27')
    expect(roundDateWindow('FINAL', 2030)).toEqual({ start: '2030-07-19', end: '2030-07-19', label: '결승' })
    expect(shiftFinalsYear('2026-07-19', 2034)).toBe('2034-07-19')
  })
  it('buildFullSchedule(year)가 전 경기 날짜를 그 연도로 생성(기본은 2026)', () => {
    const base = buildFullSchedule()
    const y2030 = buildFullSchedule(2030)
    expect(base.groupMatches.every((m) => m.date.startsWith('2026-'))).toBe(true)
    expect(y2030.groupMatches.every((m) => m.date.startsWith('2030-'))).toBe(true)
    expect(y2030.knockoutMatches.every((m) => m.date.startsWith('2030-'))).toBe(true)
    // 연도만 다르고 월/일 구조는 동일
    expect(y2030.groupMatches.map((m) => m.date.slice(5))).toEqual(base.groupMatches.map((m) => m.date.slice(5)))
  })
})

describe('예선 캘린더 윈도우 (C17·C18·C19)', () => {
  const all = simulateAllQualification('CAL-WINDOWS')
  const cal = buildQualCalendar(all)

  it('윈도우 수 = 전체 대륙 최대 라운드 수(라운드가 뭉개지지 않음)', () => {
    const maxMd = Math.max(...Object.values(all.byConfederation).map((r) => r.matchdays))
    expect(cal.length).toBe(maxMd)
  })

  it('모든 날짜가 실제 예선 기간(2025-03 ~ 2026-03) 안에 있고 본선 이전이다', () => {
    for (const d of cal) {
      expect(d.date >= '2025-03-21').toBe(true)
      expect(d.date <= '2026-03-31').toBe(true)
      expect(d.date < '2026-06-11').toBe(true) // 본선 킥오프 이전
    }
  })

  it('각 대륙은 라운드 1..M을 윈도우 0..M-1에 1:1로 채운다(뭉갬·건너뜀 없음)', () => {
    for (const c of Object.keys(all.byConfederation)) {
      const M = all.byConfederation[c].matchdays
      const windowsForConfed = new Set(
        cal.filter((d) => d.matches.some((m) => m.confederation === c)).map((d) => d.windowIndex),
      )
      // 정확히 {0,1,...,M-1} 윈도우를 사용해야 한다.
      expect([...windowsForConfed].sort((a, b) => a - b)).toEqual(Array.from({ length: M }, (_, i) => i))
    }
  })
})
