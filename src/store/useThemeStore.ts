import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'dark' | 'light'

interface ThemeStore {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
}

/**
 * 다크/라이트 테마 토글 (E4). data-theme 속성을 <html>에 설정하고 index.css의 라이트 오버라이드가
 * 반응한다. persist로 선택을 유지한다.
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      toggle: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(next)
        set({ theme: next })
      },
      setTheme: (t) => {
        applyTheme(t)
        set({ theme: t })
      },
    }),
    {
      name: 'wc2026-theme-store',
      version: 1,
      onRehydrateStorage: () => (state) => {
        // 저장된 테마를 복원 직후 DOM에 반영(초기 로드 시 깜빡임 최소화)
        if (state) applyTheme(state.theme)
      },
    },
  ),
)

// 모듈 로드 시 현재(기본 또는 복원된) 테마를 즉시 적용
applyTheme(useThemeStore.getState().theme)
