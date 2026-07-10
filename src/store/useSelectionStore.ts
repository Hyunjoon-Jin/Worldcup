import { create } from 'zustand'

interface SelectionStore {
  selectedTeamId: string | null
  selectTeam: (teamId: string) => void
  clearTeam: () => void
}

export const useSelectionStore = create<SelectionStore>()((set) => ({
  selectedTeamId: null,
  selectTeam: (teamId) => set({ selectedTeamId: teamId }),
  clearTeam: () => set({ selectedTeamId: null }),
}))
