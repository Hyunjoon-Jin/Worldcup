import type { AllQualificationResult } from './index'
import type { QualMatch } from '../../types/qualification'

/**
 * 예선 경기 일정(캘린더, B2). 대륙마다 라운드(matchday) 수가 다르므로, 각 대륙의 라운드(matchday)를
 * 매치 윈도우에 1:1로 매핑한다(matchday k → 윈도우 k−1). 윈도우 수는 전체 대륙 최대 라운드 수만큼
 * 동적으로 잡고(가장 긴 AFC 예선이 22라운드라 최대 22개), 실제 예선 기간(2025-03 ~ 2026-03)에
 * 균등 분산해 날짜를 부여한다. 실제 FIFA A매치 위클리 클러스터(며칠에 몰아 3경기 후 두 달 공백)를
 * 그대로 재현하는 대신, 라운드↔윈도우 1:1 매핑으로 단순화해 "라운드 단위 하루씩 관전"을 쉽게 한다.
 * 그러면 라운드가 뭉개지거나 건너뛰지 않고, 한 경기일에 여러 대륙 경기가 함께 열린다(#16 근거). 순수 함수(결정적).
 */
const QUAL_WINDOW_START = '2025-03-21'
const QUAL_WINDOW_END = '2026-03-31'

/** 윈도우 인덱스 w(0..total-1)를 실제 예선 기간에 균등 매핑한 ISO 날짜로 변환한다. */
function windowDate(w: number, total: number): string {
  const s = new Date(QUAL_WINDOW_START + 'T00:00:00Z').getTime()
  const e = new Date(QUAL_WINDOW_END + 'T00:00:00Z').getTime()
  const frac = total <= 1 ? 0 : w / (total - 1)
  return new Date(s + Math.round(frac * (e - s))).toISOString().slice(0, 10)
}

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

function koLabel(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

/** 전체 예선 결과로 경기일(캘린더)을 만든다. 경기가 있는 윈도우만, 날짜 오름차순. */
export function buildQualCalendar(all: AllQualificationResult): CalendarDay[] {
  const confeds = Object.keys(all.byConfederation)
  const maxMd: Record<string, number> = {}
  for (const c of confeds) maxMd[c] = all.byConfederation[c].matchdays
  // 윈도우 수 = 전체 대륙 최대 라운드 수(라운드 1:1 매핑이라 뭉개지지 않는다).
  const totalWindows = Math.max(1, ...confeds.map((c) => maxMd[c]))

  const byWindow = new Map<number, CalendarMatch[]>()
  for (const c of confeds) {
    for (const m of all.byConfederation[c].matches) {
      const w = m.matchday - 1 // matchday k → 윈도우 k−1
      const arr = byWindow.get(w)
      if (arr) arr.push({ confederation: c, match: m })
      else byWindow.set(w, [{ confederation: c, match: m }])
    }
  }

  const windows = [...byWindow.keys()].sort((a, b) => a - b)
  return windows.map((w) => {
    const revealedByConfed: Record<string, number> = {}
    // 윈도우 w까지 각 대륙은 라운드 1..(w+1)을 소화(자기 총 라운드로 상한).
    for (const c of confeds) revealedByConfed[c] = Math.min(w + 1, maxMd[c])
    const date = windowDate(w, totalWindows)
    return {
      date,
      label: koLabel(date),
      windowIndex: w,
      matches: byWindow.get(w)!,
      revealedByConfed,
    }
  })
}
