import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface MyTeamStore {
  /** 사용자가 응원하는 팀 ID(내 팀). 지정하지 않으면 null. */
  myTeamId: string | null
  setMyTeam: (teamId: string) => void
  toggleMyTeam: (teamId: string) => void
  clearMyTeam: () => void
}

/**
 * "내 팀" 지정 (D1). 응원 팀을 정하면 확률 대시보드 등에서 강조 표시된다.
 * 대회를 새로 시작해도 유지되도록 persist한다(팀 선택은 개인 취향).
 */
export const useMyTeamStore = create<MyTeamStore>()(
  persist(
    (set, get) => ({
      myTeamId: null,
      setMyTeam: (teamId) => set({ myTeamId: teamId }),
      toggleMyTeam: (teamId) => set({ myTeamId: get().myTeamId === teamId ? null : teamId }),
      clearMyTeam: () => set({ myTeamId: null }),
    }),
    { name: 'wc2026-myteam-store', version: 1 },
  ),
)
