import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TEAMS } from '../data/teams'

/** 대회(조추첨)마다 팀별 컨디션이 이 범위 안에서 무작위로 오르내린다(폼 능력치에 가감). */
const CONDITION_RANGE = 8

function rollConditions(): Record<string, number> {
  const offsets: Record<string, number> = {}
  for (const team of TEAMS) {
    offsets[team.id] = Math.round((Math.random() * 2 - 1) * CONDITION_RANGE)
  }
  return offsets
}

interface ConditionStore {
  /** 팀 ID → 이번 대회의 폼 가감치(-CONDITION_RANGE ~ +CONDITION_RANGE) */
  offsets: Record<string, number>
  /** 새 대회(조추첨)를 시작할 때 모든 팀의 컨디션을 다시 뽑는다. */
  reroll: () => void
}

/**
 * "같은 팀이라도 대회마다 컨디션이 다를 수 있다"를 표현하기 위한 대회 단위 무작위 요소.
 * 조추첨을 다시 시작할 때만 새로 뽑히고(reroll), 같은 대회 안에서는 고정된다 — 그래야
 * 몬테카를로 확률과 실제 경기 시뮬레이션이 같은 조건으로 일관되게 계산된다. persist로
 * 저장해 새로고침해도 진행 중인 대회의 컨디션이 유지된다.
 */
export const useConditionStore = create<ConditionStore>()(
  persist(
    (set) => ({
      offsets: rollConditions(),
      reroll: () => set({ offsets: rollConditions() }),
    }),
    { name: 'wc2026-condition-store' },
  ),
)
