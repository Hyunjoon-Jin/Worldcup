import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FontScale = 'normal' | 'large'

interface A11yStore {
  reduceMotion: boolean
  fontScale: FontScale
  toggleReduceMotion: () => void
  setFontScale: (s: FontScale) => void
}

function applyFontScale(scale: FontScale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.style.fontSize = scale === 'large' ? '18px' : ''
  }
}

/** 접근성 설정: 모션 줄이기·글자 크기 (v2 #39). persist로 유지. */
export const useA11yStore = create<A11yStore>()(
  persist(
    (set, get) => ({
      reduceMotion: false,
      fontScale: 'normal',
      toggleReduceMotion: () => set({ reduceMotion: !get().reduceMotion }),
      setFontScale: (s) => {
        applyFontScale(s)
        set({ fontScale: s })
      },
    }),
    {
      name: 'wc2026-a11y-store',
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state) applyFontScale(state.fontScale)
      },
    },
  ),
)

applyFontScale(useA11yStore.getState().fontScale)
