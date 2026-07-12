import { create } from 'zustand'

interface PerformanceStore {
  /** 팀 ID → 성적 기반 종합 능력치 가감치(±소폭). 예선 진행 결과가 반영된다. */
  deltas: Record<string, number>
  /** 성적 반영 능력치 보정을 통째로 설정한다. */
  setDeltas: (deltas: Record<string, number>) => void
  /** 보정을 초기화한다. */
  reset: () => void
}

/**
 * 성적에 따라 국가 능력치가 조금씩 바뀌도록 하는 보정 store. 예선 경기 결과(FIFA 랭킹 Elo 변동)를
 * 바탕으로 팀별 종합 능력치를 소폭(±) 조정한 값을 담는다. matchEngine.getRatings가 이 값을 읽어
 * 공격·수비·종합에 반영하므로, 잘 나가는 팀은 능력치가 살짝 오르고 부진한 팀은 살짝 내려간다.
 * persist하지 않는다 — 진행 상황(예선 store)에서 매번 파생 계산해 설정한다.
 */
export const usePerformanceStore = create<PerformanceStore>((set) => ({
  deltas: {},
  setDeltas: (deltas) => set({ deltas }),
  reset: () => set({ deltas: {} }),
}))
