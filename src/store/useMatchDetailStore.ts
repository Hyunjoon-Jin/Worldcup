import { create } from 'zustand'
import type { GroupMatch, KnockoutMatch } from '../types/match'

/** 경기가 속한 대회 — FIFA 랭킹 반영 중요도·경기장 표기를 대회별로 정확히 하기 위한 구분(G3). */
export type MatchCompetition = 'wc' | 'wcQual' | 'cup' | 'cupQual' | 'friendly'

export type MatchDetailRef =
  // external: 월드컵 대진이 아닌 다른 대회 경기 — 월드컵 조/브래킷·개최지 표시를 숨긴다.
  // competition: 랭킹 반영 중요도 산정용(미지정 시 'wc'로 취급 — 월드컵 본선).
  | { kind: 'group'; match: GroupMatch; date?: string; timeSlot?: string; external?: boolean; competition?: MatchCompetition }
  | { kind: 'knockout'; match: KnockoutMatch; date?: string; timeSlot?: string; external?: boolean; competition?: MatchCompetition }
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
