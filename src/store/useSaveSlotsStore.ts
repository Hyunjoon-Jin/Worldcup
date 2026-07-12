import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { captureSnapshot, restoreSnapshot, type TournamentSnapshot } from './tournamentSnapshot'

export interface SaveSlot {
  id: string
  label: string
  savedAt: number
  snapshot: TournamentSnapshot
}

interface SaveSlotsStore {
  slots: SaveSlot[]
  saveCurrent: (label: string) => void
  load: (id: string) => void
  remove: (id: string) => void
}

const MAX_SLOTS = 6

/**
 * 대회 저장 슬롯 (D3). 현재 대회를 이름 붙여 저장하고, 나중에 불러오거나 삭제한다.
 * 여러 조추첨/시뮬 결과를 보관해 비교 감상할 수 있다. 슬롯은 최대 MAX_SLOTS개까지.
 */
export const useSaveSlotsStore = create<SaveSlotsStore>()(
  persist(
    (set, get) => ({
      slots: [],
      saveCurrent: (label) => {
        const slot: SaveSlot = {
          id: `slot-${Date.now()}`,
          label: label.trim() || `대회 ${get().slots.length + 1}`,
          savedAt: Date.now(),
          snapshot: captureSnapshot(),
        }
        set({ slots: [slot, ...get().slots].slice(0, MAX_SLOTS) })
      },
      load: (id) => {
        const slot = get().slots.find((s) => s.id === id)
        if (slot) restoreSnapshot(slot.snapshot)
      },
      remove: (id) => set({ slots: get().slots.filter((s) => s.id !== id) }),
    }),
    { name: 'wc2026-saveslots-store', version: 1 },
  ),
)
