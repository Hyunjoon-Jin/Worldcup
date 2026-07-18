import { CUP_FORMATS, ALL_CUP_IDS, type CupId, type MonthWindow } from '../../data/continental/formats'
import { GROUP_STAGE_START, GROUP_STAGE_END, ROUND_DATE_WINDOWS, shiftFinalsYear } from '../../data/calendar'
import { qualWindowDate, QUAL_TOTAL_WINDOWS } from '../qualification/calendar'
import type { Confederation } from '../../types/team'
import type { KnockoutRound } from '../../types/match'

const ROUND_LABEL_KO: Record<KnockoutRound, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위전', FINAL: '결승' }

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

/** 한 대회의 세부 단계(날짜 있는 라운드). 캘린더/대회 일정 표시용. */
export interface EventPhase {
  key: string
  label: string
  start: string // ISO
  end: string // ISO
}

/** 대륙컵 한 에디션을 조별 각 차전 + 녹아웃 라운드(3·4위전 포함)로 날짜와 함께 전개한다(대륙대회 일정 상세화). */
export function buildCupPhases(cupId: CupId, editionYear: number): EventPhase[] {
  const f = CUP_FORMATS[cupId]
  const { start } = cupWindow(cupId, editionYear)
  const phases: EventPhase[] = []
  const mdLabel = ['1차전', '2차전', '3차전']
  f.schedule.groupDayOffsets.forEach((off, i) => {
    const d = addDays(start, off - 1) // Day 1 = 개막
    phases.push({ key: `G${i + 1}`, label: `조별리그 ${mdLabel[i] ?? `${i + 1}차전`}`, start: d, end: d })
  })
  // 녹아웃 라운드는 오프셋 순서(날짜순)로 — 3·4위전이 결승보다 앞서는 배치도 데이터대로 반영.
  const koEntries = (Object.entries(f.schedule.knockoutDayOffsets) as Array<[KnockoutRound, number]>)
    .filter(([, off]) => off != null)
    .sort((a, b) => a[1] - b[1])
  for (const [round, off] of koEntries) {
    const d = addDays(start, off - 1)
    phases.push({ key: round, label: ROUND_LABEL_KO[round], start: d, end: d })
  }
  // 조추첨: 개막 3주 전. 캘린더에 조추첨 일정을 명시한다(가장 이른 단계이므로 맨 앞).
  const drawDate = addDays(start, -DRAW_DAYS_BEFORE)
  phases.unshift({ key: 'DRAW', label: '조추첨', start: drawDate, end: drawDate })
  return phases
}

/** 조추첨은 대회 개막 며칠 전에 열리는가(대륙컵). 캘린더 표시·진행 게이팅 공용. */
export const DRAW_DAYS_BEFORE = 21

/** 월드컵 한 에디션을 지역예선(전년~) + 조별리그 + 녹아웃 라운드창으로 전개한다. 캘린더가 예선부터 시작한다. */
export function buildWcPhases(wcYear: number): EventPhase[] {
  const phases: EventPhase[] = []
  // 지역예선: 실제 예선 기간(전년 3월 ~ 개최년 3월)의 매치 윈도우를 경기일로 표시한다.
  for (let w = 0; w < QUAL_TOTAL_WINDOWS; w++) {
    const d = qualWindowDate(w, wcYear)
    phases.push({ key: `Q${w + 1}`, label: `지역예선 ${w + 1}차`, start: d, end: d })
  }
  // 본선 조추첨: 개막 6주 전(예선 종료 후). 캘린더에 조추첨 일정을 명시한다.
  const groupStart = shiftFinalsYear(GROUP_STAGE_START, wcYear)
  phases.push({ key: 'DRAW', label: '본선 조추첨', start: addDays(groupStart, -42), end: addDays(groupStart, -42) })
  phases.push({ key: 'GROUP', label: '조별리그', start: groupStart, end: shiftFinalsYear(GROUP_STAGE_END, wcYear) })
  for (const r of ['R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL'] as KnockoutRound[]) {
    const w = ROUND_DATE_WINDOWS[r]
    phases.push({ key: r, label: w.label, start: shiftFinalsYear(w.start, wcYear), end: shiftFinalsYear(w.end, wcYear) })
  }
  return phases
}

/** 시즌 이벤트(월드컵/대륙컵)를 날짜가 있는 세부 단계로 전개한다(공용). */
export function buildEventPhases(event: SeasonEvent): EventPhase[] {
  return event.kind === 'wc' ? buildWcPhases(event.year) : buildCupPhases(event.id as CupId, event.year)
}

/** 캘린더 위의 세부 일정 항목(대회 컨텍스트 포함). */
export interface CalendarPhase extends EventPhase {
  eventKind: 'wc' | 'cup'
  eventId: CupId | 'WC'
  eventNameKo: string
  eventYear: number
  confeds: Confederation[] | 'ALL'
}

/** 한 월드컵 사이클의 모든 대회를 세부 단계(라운드별 날짜)로 펼친 캘린더 항목 목록. */
export function buildCycleCalendar(wcYear: number): CalendarPhase[] {
  return buildSeasonTimeline(wcYear).flatMap((e) =>
    buildEventPhases(e).map((p) => ({
      ...p,
      eventKind: e.kind,
      eventId: e.id,
      eventNameKo: e.nameKo,
      eventYear: e.year,
      confeds: e.confeds,
    })),
  )
}
