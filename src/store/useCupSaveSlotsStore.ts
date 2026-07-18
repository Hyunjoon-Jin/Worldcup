import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useContinentalStore } from './useContinentalStore'

/** 대륙컵 저장 스냅샷 — 대륙컵 스토어의 직렬화 가능한 진행 상태 전체. */
export interface CupSnapshot {
  activeCupId: ReturnType<typeof useContinentalStore.getState>['activeCupId']
  seed: string | null
  hostIds: string[]
  cupYear: number | null
  qualResult: ReturnType<typeof useContinentalStore.getState>['qualResult']
  result: ReturnType<typeof useContinentalStore.getState>['result']
  probabilities: ReturnType<typeof useContinentalStore.getState>['probabilities']
  championTrend: ReturnType<typeof useContinentalStore.getState>['championTrend']
  stage: number
  drawRevealCount: number
}

export interface CupSaveSlot {
  id: string
  label: string
  savedAt: number
  snapshot: CupSnapshot
}

interface CupSaveSlotsStore {
  slots: CupSaveSlot[]
  saveCurrent: (label: string) => void
  load: (id: string) => void
  remove: (id: string) => void
  clearAll: () => void
}

const MAX_SLOTS = 6

function captureCup(): CupSnapshot {
  const s = useContinentalStore.getState()
  return {
    activeCupId: s.activeCupId,
    seed: s.seed,
    hostIds: s.hostIds,
    cupYear: s.cupYear,
    qualResult: s.qualResult,
    result: s.result,
    probabilities: s.probabilities,
    championTrend: s.championTrend,
    stage: s.stage,
    drawRevealCount: s.drawRevealCount,
  }
}

/**
 * 대륙컵 저장 슬롯 — 월드컵 useSaveSlotsStore와 동형. 현재 대륙컵 진행 상태를 이름 붙여 저장하고
 * 나중에 불러오거나 삭제한다. 월드컵 저장 슬롯과 완전히 분리된 별도 persist 키.
 */
export const useCupSaveSlotsStore = create<CupSaveSlotsStore>()(
  persist(
    (set, get) => ({
      slots: [],
      saveCurrent: (label) => {
        const slot: CupSaveSlot = {
          id: `cupslot-${Date.now()}`,
          label: label.trim() || `대회 ${get().slots.length + 1}`,
          savedAt: Date.now(),
          snapshot: captureCup(),
        }
        set({ slots: [slot, ...get().slots].slice(0, MAX_SLOTS) })
      },
      load: (id) => {
        const slot = get().slots.find((s) => s.id === id)
        if (slot) useContinentalStore.setState({ ...slot.snapshot })
      },
      remove: (id) => set({ slots: get().slots.filter((s) => s.id !== id) }),
      clearAll: () => set({ slots: [] }),
    }),
    { name: 'wc2026-cup-saveslots-store', version: 1 },
  ),
)
