import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SoundStore {
  enabled: boolean
  toggle: () => void
}

/** 효과음·햅틱 on/off (v2 #49). 기본 off(조용히 시작), persist로 유지. */
export const useSoundStore = create<SoundStore>()(
  persist(
    (set, get) => ({
      enabled: false,
      toggle: () => set({ enabled: !get().enabled }),
    }),
    { name: 'wc2026-sound-store', version: 1 },
  ),
)
