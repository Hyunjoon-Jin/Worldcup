import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * 시즌(일정) 진행 척추. 앱의 모든 흐름은 '월드컵'이 아니라 '일정'을 기준으로 전진한다 — 캘린더 위의
 * 이벤트(월드컵 예선·본선, 대륙컵 예선·본선)를 시간 순서로 하나씩 진행한다. 이 스토어는 그 진행 위치
 * (cursor)를 소유한다. 실제 이벤트 데이터는 buildSeasonTimeline(wcYear)에서 파생하며, 월드컵은 그 위의
 * 한 이벤트일 뿐이다. 커리어 연도(useCareerStore)는 캘린더가 한 사이클을 다 소화했을 때만 넘어간다.
 */
interface SeasonStore {
  /** 현재 진행 위치(시즌 이벤트 목록의 인덱스, 날짜 순). */
  cursorIndex: number
  setCursor: (i: number) => void
  /** 다음 일정으로. total은 현재 사이클의 이벤트 수. 마지막을 넘어서면 onCycleEnd를 호출(다음 WC 사이클). */
  advance: (total: number, onCycleEnd: () => void) => void
  reset: () => void
}

export const useSeasonStore = create<SeasonStore>()(
  persist(
    (set, get) => ({
      cursorIndex: 0,
      setCursor: (i) => set({ cursorIndex: Math.max(0, i) }),
      advance: (total, onCycleEnd) => {
        const next = get().cursorIndex + 1
        if (next >= total) {
          // 사이클의 마지막 일정까지 마침 → 다음 월드컵 사이클로 넘어가고 커서를 처음으로.
          onCycleEnd()
          set({ cursorIndex: 0 })
        } else {
          set({ cursorIndex: next })
        }
      },
      reset: () => set({ cursorIndex: 0 }),
    }),
    { name: 'wc2026-season-store', version: 1 },
  ),
)
