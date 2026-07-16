import { create } from 'zustand'
import type { GroupMatch, KnockoutMatch } from '../types/match'

export type MatchDetailRef =
  // external: 월드컵 대진이 아닌 다른 대회(대륙컵) 경기 — 월드컵 조/브래킷 맥락 표시를 숨긴다.
  | { kind: 'group'; match: GroupMatch; date?: string; timeSlot?: string; external?: boolean }
  | { kind: 'knockout'; match: KnockoutMatch; date?: string; timeSlot?: string; external?: boolean }
  | {
      kind: 'upcoming'
      homeTeamId: string
      awayTeamId: string
      label: string
      date?: string
      timeSlot?: string
    }

interface MatchDetailStore {
  selected: MatchDetailRef | null
  selectMatch: (ref: MatchDetailRef) => void
  clearMatch: () => void
}

export const useMatchDetailStore = create<MatchDetailStore>()((set) => ({
  selected: null,
  selectMatch: (ref) => set({ selected: ref }),
  clearMatch: () => set({ selected: null }),
}))
