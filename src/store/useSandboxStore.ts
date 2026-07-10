import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TeamRatings } from '../types/team'

interface SandboxStore {
  sandboxMode: boolean
  overrides: Record<string, Partial<TeamRatings>>
  toggleSandbox: () => void
  setOverride: (teamId: string, ratings: Partial<TeamRatings>) => void
  resetTeam: (teamId: string) => void
  resetAll: () => void
}

export const useSandboxStore = create<SandboxStore>()(
  persist(
    (set, get) => ({
      sandboxMode: false,
      overrides: {},
      toggleSandbox: () => set({ sandboxMode: !get().sandboxMode }),
      setOverride: (teamId, ratings) =>
        set({ overrides: { ...get().overrides, [teamId]: { ...get().overrides[teamId], ...ratings } } }),
      resetTeam: (teamId) => {
        const next = { ...get().overrides }
        delete next[teamId]
        set({ overrides: next })
      },
      resetAll: () => set({ overrides: {} }),
    }),
    { name: 'wc2026-sandbox-store' },
  ),
)

export function getEffectiveRatings(teamId: string, base: TeamRatings): TeamRatings {
  const override = useSandboxStore.getState().overrides[teamId]
  if (!override) return base
  return { ...base, ...override }
}
