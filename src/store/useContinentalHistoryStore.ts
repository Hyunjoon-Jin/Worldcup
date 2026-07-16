import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CupId } from '../data/continental/formats'

/**
 * 대륙컵 역대 기록(아카이브). 월드컵 히스토리(useHistoryStore, 연도 dedup)와 **분리된 병렬 스토어**로,
 * 대륙컵+월드컵 동일 연도 충돌 위험을 원천 차단한다(감사 D3). 완주한 대회를 (cupId, seed)로 dedup해 누적한다.
 */
export interface CupEdition {
  cupId: CupId
  seed: string
  champion: string
  runnerUp: string
  third: string | null
  /** 조별 통과(녹아웃 진출) 팀 — 통산 성적 집계용 */
  qualified: string[]
}

const MAX_EDITIONS = 80

interface ContinentalHistoryStore {
  editions: CupEdition[]
  record: (e: CupEdition) => void
  reset: () => void
}

export const useContinentalHistoryStore = create<ContinentalHistoryStore>()(
  persist(
    (set, get) => ({
      editions: [],
      record: (e) => {
        // 같은 대회·같은 시드는 한 번만(재시뮬 중복 방지). 최신을 앞에.
        const rest = get().editions.filter((x) => !(x.cupId === e.cupId && x.seed === e.seed))
        set({ editions: [e, ...rest].slice(0, MAX_EDITIONS) })
      },
      reset: () => set({ editions: [] }),
    }),
    { name: 'wc2026-continental-history-store', version: 1 },
  ),
)

/** 한 팀의 대륙컵 통산 성적: 대회별 우승·준우승·3위·본선 진출 횟수. */
export interface CupTeamHonors {
  byCup: Partial<Record<CupId, { titles: number; runnerUp: number; third: number; appearances: number }>>
  totalTitles: number
}

export function aggregateCupHonors(editions: CupEdition[], teamId: string): CupTeamHonors {
  const byCup: CupTeamHonors['byCup'] = {}
  let totalTitles = 0
  for (const e of editions) {
    const slot = byCup[e.cupId] ?? (byCup[e.cupId] = { titles: 0, runnerUp: 0, third: 0, appearances: 0 })
    if (e.qualified.includes(teamId) || e.champion === teamId || e.runnerUp === teamId) slot.appearances += 1
    if (e.champion === teamId) { slot.titles += 1; totalTitles += 1 }
    if (e.runnerUp === teamId) slot.runnerUp += 1
    if (e.third === teamId) slot.third += 1
  }
  return { byCup, totalTitles }
}
