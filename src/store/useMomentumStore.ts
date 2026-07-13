import { create } from 'zustand'
import { computeMomentumOffsets } from '../engine/momentum'
import { useProgressStore } from './useProgressStore'
import type { KnockoutMatch } from '../types/match'

interface MomentumStore {
  /** 팀 ID → 최근 성적 기반 폼 가감치(-max ~ +max) */
  offsets: Record<string, number>
  /** 확정된 진행 결과로부터 모멘텀을 다시 계산한다. */
  recompute: () => void
}

/**
 * 대회 진행 중 팀별 모멘텀(폼 가감치)을 확정 결과로부터 계산해 캐시한다 (C4).
 * 매 경기 진행마다 recompute를 호출하면, getRatings가 이 값을 읽어 폼에 반영한다.
 * 확정 결과만 사용하므로 한 번의 확률 계산 동안 값이 고정되어 일관성이 유지된다.
 */
export const useMomentumStore = create<MomentumStore>()((set) => ({
  offsets: {},
  recompute: () => {
    const progress = useProgressStore.getState()
    const knockoutMatches = Object.values(progress.knockoutSlots)
      .map((s) => s.result)
      .filter((r): r is KnockoutMatch => r != null)
    set({ offsets: computeMomentumOffsets(progress.groupMatches, knockoutMatches) })
  },
}))
