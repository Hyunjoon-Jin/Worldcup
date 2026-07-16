import { CUP_FORMATS, ALL_CUP_IDS, type CupId, type MonthWindow } from '../../data/continental/formats'
import { GROUP_STAGE_START, ROUND_DATE_WINDOWS, shiftFinalsYear } from '../../data/calendar'
import type { Confederation } from '../../types/team'

/**
 * 시즌 타임라인(대륙대회-일정조사 §1). 한 월드컵 사이클(wcYear ~ wcYear+3)에서 월드컵 본선과 6개 대륙컵을
 * 실제 개최 시기 규칙대로 절대 날짜에 배치한다. 이를 통해 "언제 어떤 대회가 열리는가"를 한 곳에서 정하고,
 * 한 팀이 같은 날짜에 두 대회를 치르지 않음(요구 ① 일정 충돌 방지)을 구조적으로 보장한다.
 *
 * 배치 규칙(짝수 wcYear 기준):
 * - 월드컵 본선: wcYear 6~7월.
 * - 아시안컵: wcYear+1 1월(월드컵 다음해).
 * - AFCON: wcYear+1(월/겨울 여부는 포맷 데이터).
 * - 골드컵: wcYear+1·wcYear+3 홀수년 여름.
 * - 유로·코파: wcYear+2 여름(월드컵 2년 뒤).
 * - OFC: wcYear+2 여름.
 */

export interface SeasonEvent {
  kind: 'wc' | 'cup'
  id: CupId | 'WC'
  nameKo: string
  confeds: Confederation[] | 'ALL'
  year: number
  start: string // ISO
  end: string // ISO
}

/** 대회별 개최 연도 오프셋(wcYear 대비). 골드컵은 홀수년마다라 사이클 내 2회. */
const YEAR_OFFSET: Record<CupId, number[]> = {
  ASIAN: [1],
  AFCON: [1],
  GOLD: [1, 3],
  EURO: [2],
  COPA: [2],
  OFC: [2],
}

/** 개최 시기 유형 → (월, 일) 시작. winterAfcon은 전해 12월 21일 시작(다음해 1월로 이어짐). */
const WINDOW_START: Record<MonthWindow, { month: number; day: number; yearShift: number }> = {
  summer: { month: 6, day: 14, yearShift: 0 },
  january: { month: 1, day: 7, yearShift: 0 },
  winterAfcon: { month: 12, day: 21, yearShift: -1 }, // "2027 대회"가 실제로는 2026-12 시작하는 식
}

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO 날짜에 일수를 더한다(UTC 기준, 결정론적). */
export function addDays(iso: string, days: number): string {
  const ms = new Date(iso + 'T00:00:00Z').getTime() + days * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

function cupWindow(cupId: CupId, editionYear: number): { start: string; end: string } {
  const f = CUP_FORMATS[cupId]
  const w = WINDOW_START[f.schedule.monthWindow]
  const startYear = editionYear + w.yearShift
  const start = `${startYear}-${pad(w.month)}-${pad(w.day)}`
  const end = addDays(start, f.schedule.totalDays - 1)
  return { start, end }
}

/** 월드컵 본선 창(그룹 시작 ~ 결승). wcYear로 이동. */
function wcWindow(wcYear: number): { start: string; end: string } {
  return { start: shiftFinalsYear(GROUP_STAGE_START, wcYear), end: shiftFinalsYear(ROUND_DATE_WINDOWS.FINAL.end, wcYear) }
}

/** 한 사이클(wcYear ~ wcYear+3)의 대회 배치를 날짜순으로 반환한다. */
export function buildSeasonTimeline(wcYear: number): SeasonEvent[] {
  const events: SeasonEvent[] = []
  const wc = wcWindow(wcYear)
  events.push({ kind: 'wc', id: 'WC', nameKo: 'FIFA 월드컵', confeds: 'ALL', year: wcYear, start: wc.start, end: wc.end })

  for (const cupId of ALL_CUP_IDS) {
    for (const off of YEAR_OFFSET[cupId]) {
      const editionYear = wcYear + off
      const { start, end } = cupWindow(cupId, editionYear)
      events.push({ kind: 'cup', id: cupId, nameKo: CUP_FORMATS[cupId].nameKo, confeds: CUP_FORMATS[cupId].confeds, year: editionYear, start, end })
    }
  }

  return events.sort((a, b) => a.start.localeCompare(b.start) || a.nameKo.localeCompare(b.nameKo))
}

/** 두 이벤트에 같은 팀이 동시에 참가할 수 있는가(월드컵은 모든 팀 / 대륙컵은 소속 연맹 겹칠 때). */
export function eventsSharePossibleTeam(a: SeasonEvent, b: SeasonEvent): boolean {
  if (a.confeds === 'ALL' || b.confeds === 'ALL') return true
  return a.confeds.some((c) => (b.confeds as Confederation[]).includes(c))
}

/** 두 날짜 구간이 겹치는가(경계 포함). */
export function windowsOverlap(a: SeasonEvent, b: SeasonEvent): boolean {
  return a.start <= b.end && b.start <= a.end
}
