import type { KnockoutRound } from '../types/match'

// 실제 2026 북중미 월드컵 일정(날짜 창)을 그대로 채택한다.
// 그룹스테이지는 Day 인덱스(1~) 로 진행하며, 토너먼트는 라운드별 날짜창 안에서 진행한다.
export const GROUP_STAGE_DAYS = 12
export const GROUP_STAGE_START = '2026-06-11'
export const GROUP_STAGE_END = '2026-06-27'

export const ROUND_DATE_WINDOWS: Record<KnockoutRound, { start: string; end: string; label: string }> = {
  R32: { start: '2026-06-28', end: '2026-07-03', label: '32강' },
  R16: { start: '2026-07-04', end: '2026-07-07', label: '16강' },
  QF: { start: '2026-07-09', end: '2026-07-11', label: '8강' },
  SF: { start: '2026-07-14', end: '2026-07-15', label: '4강' },
  THIRD: { start: '2026-07-18', end: '2026-07-18', label: '3·4위전' },
  FINAL: { start: '2026-07-19', end: '2026-07-19', label: '결승' },
}

/**
 * 조별리그 진행일(1~GROUP_STAGE_DAYS)을 실제 조별리그 기간[START, END]에 고르게 매핑한다.
 * day 1 → START, 마지막 day → END. 12개 진행일을 6/11~6/27 창에 분산하므로 중간중간 휴식일이
 * 생기고, 선언된 종료일(GROUP_STAGE_END)과 마지막 진행일 날짜가 일치한다.
 */
export function dateForGroupStageDay(day: number): string {
  const startMs = new Date(GROUP_STAGE_START + 'T00:00:00Z').getTime()
  const endMs = new Date(GROUP_STAGE_END + 'T00:00:00Z').getTime()
  const frac = GROUP_STAGE_DAYS <= 1 ? 0 : (Math.min(Math.max(day, 1), GROUP_STAGE_DAYS) - 1) / (GROUP_STAGE_DAYS - 1)
  const ms = startMs + Math.round(frac * (endMs - startMs))
  return new Date(ms).toISOString().slice(0, 10)
}

export function formatKoreanDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-')
  return `${Number(m)}월 ${Number(d)}일`
}
