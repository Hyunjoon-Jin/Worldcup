import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Skin = 'default' | 'sky' | 'violet' | 'amber'

export const SKIN_SWATCH: Record<Skin, string> = {
  default: '#34d399',
  sky: '#38bdf8',
  violet: '#a78bfa',
  amber: '#fbbf24',
}

export const SKIN_LABEL: Record<Skin, string> = {
  default: '에메랄드',
  sky: '스카이',
  violet: '바이올렛',
  amber: '앰버',
}

interface SkinStore {
  skin: Skin
  setSkin: (s: Skin) => void
}

function applySkin(skin: Skin): void {
  if (typeof document === 'undefined') return
  if (skin === 'default') delete document.documentElement.dataset.skin
  else document.documentElement.dataset.skin = skin
}

/** 액센트 스킨 (v2 #50). 에메랄드 액센트를 다른 색으로 바꾼다. persist로 유지. */
export const useSkinStore = create<SkinStore>()(
  persist(
    (set) => ({
      skin: 'default',
      setSkin: (s) => {
        applySkin(s)
        set({ skin: s })
      },
    }),
    {
      name: 'wc2026-skin-store',
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state) applySkin(state.skin)
      },
    },
  ),
)

applySkin(useSkinStore.getState().skin)
