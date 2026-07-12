import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OnboardingStore {
  /** 온보딩을 이미 봤는지(다시 보지 않음). */
  seen: boolean
  dismiss: () => void
  reopen: () => void
}

/** 첫 방문자용 온보딩 표시 여부 (v2 #48). persist로 한 번 닫으면 다시 뜨지 않는다. */
export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      seen: false,
      dismiss: () => set({ seen: true }),
      reopen: () => set({ seen: false }),
    }),
    { name: 'wc2026-onboarding-store', version: 1 },
  ),
)
