import type { AllQualificationResult } from './index'
import type { QualMatch } from '../../types/qualification'

/**
 * 예선 경기 일정(캘린더, B2). 대륙마다 라운드(matchday) 수가 다르므로, 공통 FIFA 매치 윈도우
 * 배열에 각 대륙의 라운드를 균등 매핑해 "경기일" 단위로 모은다. 그러면 한 경기일에 여러 대륙의
 * 경기가 함께 열려(실제 A매치 기간처럼) 날짜별로 진행·관전할 수 있다. 순수 함수(결정적).
 */
const WINDOW_DATES = [
  '2025-03-21', '2025-06-06', '2025-06-10', '2025-09-05',
  '2025-09-09', '2025-10-10', '2025-10-14', '2025-11-14',
  '2025-11-18', '2026-03-26', '2026-03-31', '2026-06-06',
] as const
const W = WINDOW_DATES.length

export interface CalendarMatch {
  confederation: string
  match: QualMatch
}

export interface CalendarDay {
  /** ISO 날짜(yyyy-mm-dd) */
  date: string
  /** 한글 표기(예: 2025년 6월 10일) */
  label: string
  /** 매치 윈도우 인덱스(0부터) */
  windowIndex: number
  /** 이 날 열리는 경기들 */
  matches: CalendarMatch[]
  /** 이 날까지 각 대륙이 소화한 누적 라운드(matchday) — 표 공개 동기화용 */
  revealedByConfed: Record<string, number>
}

/** 라운드 k(1..M)를 매치 윈도우 인덱스(0..W-1)로 매핑한다. k=1→첫 윈도우, k=M→마지막 윈도우. */
function windowIndexFor(matchday: number, maxMatchday: number): number {
  if (maxMatchday <= 1) return 0
  return Math.round(((matchday - 1) * (W - 1)) / (maxMatchday - 1))
}

function koLabel(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

/** 전체 예선 결과로 경기일(캘린더)을 만든다. 경기가 있는 윈도우만, 날짜 오름차순. */
export function buildQualCalendar(all: AllQualificationResult): CalendarDay[] {
  const confeds = Object.keys(all.byConfederation)
  const maxMd: Record<string, number> = {}
  for (const c of confeds) maxMd[c] = all.byConfederation[c].matchdays

  const byWindow = new Map<number, CalendarMatch[]>()
  for (const c of confeds) {
    const M = maxMd[c]
    for (const m of all.byConfederation[c].matches) {
      const w = windowIndexFor(m.matchday, M)
      const arr = byWindow.get(w)
      if (arr) arr.push({ confederation: c, match: m })
      else byWindow.set(w, [{ confederation: c, match: m }])
    }
  }

  const windows = [...byWindow.keys()].sort((a, b) => a - b)
  return windows.map((w) => {
    const revealedByConfed: Record<string, number> = {}
    for (const c of confeds) {
      const M = maxMd[c]
      let reveal = 0
      for (let k = 1; k <= M; k++) {
        if (windowIndexFor(k, M) <= w) reveal = k
      }
      revealedByConfed[c] = reveal
    }
    return {
      date: WINDOW_DATES[w],
      label: koLabel(WINDOW_DATES[w]),
      windowIndex: w,
      matches: byWindow.get(w)!,
      revealedByConfed,
    }
  })
}
