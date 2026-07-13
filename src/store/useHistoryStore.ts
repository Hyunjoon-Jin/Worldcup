import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EditionRecord } from '../engine/history'

/** 역대 기록에 보관할 최대 대회 수(오래된 것부터 폐기). localStorage 용량 보호. */
const MAX_EDITIONS = 30

interface HistoryStore {
  /** 완료된 대회 기록(오래된 → 최신) */
  editions: EditionRecord[]
  /** 한 대회를 역대 기록에 추가한다(같은 연도가 이미 있으면 갱신). */
  recordEdition: (rec: EditionRecord) => void
  reset: () => void
}

/**
 * 커리어 모드 역대 기록 저장소. 대회가 끝나고 다음 대회로 넘어갈 때 각 대회의 국가별 성적·순위
 * 스냅샷을 축적해, 국가 상세의 '역대 기록'에서 통산 전적·연도별 성적·랭킹 추이를 보여준다.
 */
export const useHistoryStore = create<HistoryStore>()(
  persist(
    (set, get) => ({
      editions: [],
      recordEdition: (rec) => {
        const existing = get().editions.filter((e) => e.year !== rec.year)
        const next = [...existing, rec].sort((a, b) => a.year - b.year)
        set({ editions: next.slice(-MAX_EDITIONS) })
      },
      reset: () => set({ editions: [] }),
    }),
    { name: 'wc2026-history-store', version: 1 },
  ),
)
