import { create } from 'zustand'
import type { GroupMatch, KnockoutMatch } from '../types/match'

export type MatchDetailRef =
  | { kind: 'group'; match: GroupMatch; date?: string; timeSlot?: string }
  | { kind: 'knockout'; match: KnockoutMatch; date?: string; timeSlot?: string }
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
