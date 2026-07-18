import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 내 팀 버프 단계 — 공격/수비/종합에 더해지는 능력치 가점(0=없음). */
export const MY_TEAM_BUFF_LEVELS = [0, 3, 6, 10] as const
export type MyTeamBuff = (typeof MY_TEAM_BUFF_LEVELS)[number]

/** 버프 단계별 한글 라벨. */
export const MY_TEAM_BUFF_LABEL: Record<MyTeamBuff, string> = {
  0: '없음',
  3: '약 (+3)',
  6: '중 (+6)',
  10: '강 (+10)',
}

interface MyTeamStore {
  /** 사용자가 응원하는 팀 ID(내 팀). 지정하지 않으면 null. */
  myTeamId: string | null
  /** 내 팀에 적용할 능력치 버프(0=없음). 시뮬레이션 전반(예선·본선·확률)에 반영된다. */
  buff: MyTeamBuff
  /** 내 팀 중심 진행 — 내 팀이 참가하지 않는 대회(대륙컵 등)는 자동 시뮬레이션으로 넘긴다(기본 켜짐). */
  autoSkipOthers: boolean
  setMyTeam: (teamId: string) => void
  toggleMyTeam: (teamId: string) => void
  clearMyTeam: () => void
  setBuff: (buff: MyTeamBuff) => void
  setAutoSkipOthers: (on: boolean) => void
}

/**
 * "내 팀" 지정 (D1). 응원 팀을 정하면 확률 대시보드 등에서 강조 표시된다.
 * 대회를 새로 시작해도 유지되도록 persist한다(팀 선택은 개인 취향).
 * buff로 내 팀에 능력치 가점을 줘 "내 팀으로 플레이" 시 유리하게 진행할 수 있다.
 */
export const useMyTeamStore = create<MyTeamStore>()(
  persist(
    (set, get) => ({
      myTeamId: null,
      buff: 0,
      autoSkipOthers: true,
      setMyTeam: (teamId) => set({ myTeamId: teamId }),
      toggleMyTeam: (teamId) => set({ myTeamId: get().myTeamId === teamId ? null : teamId }),
      clearMyTeam: () => set({ myTeamId: null }),
      setBuff: (buff) => set({ buff }),
      setAutoSkipOthers: (on) => set({ autoSkipOthers: on }),
    }),
    { name: 'wc2026-myteam-store', version: 2 },
  ),
)
