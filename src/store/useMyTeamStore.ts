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

/** 전술 스탠스 — 종합은 그대로 두고 공격/수비를 상쇄 이동시키는 리스크/리워드 선택(감독 결정권). */
export type MyStance = 'attacking' | 'balanced' | 'defensive'
/** 스탠스별 공격/수비 가감(종합 불변). 공격적=많이 넣고 많이 먹힘, 수비적=적게 넣고 적게 먹힘. */
export const STANCE_TILT: Record<MyStance, { attack: number; defense: number }> = {
  attacking: { attack: 4, defense: -4 },
  balanced: { attack: 0, defense: 0 },
  defensive: { attack: -4, defense: 4 },
}
export const STANCE_LABEL: Record<MyStance, string> = { attacking: '⚔️ 공격적', balanced: '⚖️ 균형', defensive: '🛡 수비적' }

interface MyTeamStore {
  /** 사용자가 응원하는 팀 ID(내 팀). 지정하지 않으면 null. */
  myTeamId: string | null
  /** 내 팀에 적용할 능력치 버프(0=없음). 시뮬레이션 전반(예선·본선·확률)에 반영된다. */
  buff: MyTeamBuff
  /** 전술 스탠스(감독 결정권) — 종합 불변, 공격/수비 상쇄 이동. 시뮬 전반에 반영. */
  stance: MyStance
  /** 내 팀 중심 진행 — 내 팀이 참가하지 않는 대회(대륙컵 등)는 자동 시뮬레이션으로 넘긴다(기본 켜짐). */
  autoSkipOthers: boolean
  setMyTeam: (teamId: string) => void
  toggleMyTeam: (teamId: string) => void
  clearMyTeam: () => void
  setBuff: (buff: MyTeamBuff) => void
  setStance: (stance: MyStance) => void
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
      stance: 'balanced',
      autoSkipOthers: true,
      setMyTeam: (teamId) => set({ myTeamId: teamId }),
      toggleMyTeam: (teamId) => set({ myTeamId: get().myTeamId === teamId ? null : teamId }),
      clearMyTeam: () => set({ myTeamId: null }),
      setBuff: (buff) => set({ buff }),
      setStance: (stance) => set({ stance }),
      setAutoSkipOthers: (on) => set({ autoSkipOthers: on }),
    }),
    { name: 'wc2026-myteam-store', version: 2 },
  ),
)
