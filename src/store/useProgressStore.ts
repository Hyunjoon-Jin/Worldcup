import { create } from 'zustand'
import { GROUP_LETTERS } from '../data/hostSlots'
import {
  FINAL_SLOT_ID,
  QF_SLOT_IDS,
  R16_SLOT_IDS,
  R32_SLOT_IDS,
  SF_SLOT_IDS,
  THIRD_SLOT_ID,
} from '../data/bracketTemplate'
import { buildFullSchedule } from '../engine/scheduleEngine'
import { simulateKnockoutMatch, simulateMatch } from '../engine/matchEngine'
import { rankGroupTeams } from '../engine/tiebreakers'
import {
  buildR32Matchups,
  computeGroupResults,
  computeQualifiedThirdGroups,
  progressBracket,
  type GroupResult,
  type KnockoutSlotState,
} from '../engine/tournamentSimulation'
import { useDrawStore } from './useDrawStore'
import type { GroupLetter } from '../types/group'
import type { GroupMatch, KnockoutMatch } from '../types/match'
import type { TournamentSchedule } from '../types/schedule'

type Phase = 'idle' | 'group' | 'knockout' | 'complete'

interface ProgressStore {
  schedule: TournamentSchedule | null
  phase: Phase
  currentDay: number
  groupMatches: GroupMatch[]
  lastDayDate: string | null
  lastDayGroupResults: GroupMatch[]
  lastDeltaByGroup: Record<string, Record<string, number>>
  groupResults: Record<GroupLetter, GroupResult> | null
  qualifiedThirdGroups: GroupLetter[]
  knockoutSlots: Record<string, KnockoutSlotState>
  lastKnockoutResults: KnockoutMatch[]
  champion: string | null
  initSchedule: () => void
  advanceDay: () => void
  reset: () => void
}

function emptySlots(): Record<string, KnockoutSlotState> {
  const slots: Record<string, KnockoutSlotState> = {}
  const allIds: [string, KnockoutSlotState['round']][] = [
    ...R32_SLOT_IDS.map((id) => [id, 'R32'] as [string, KnockoutSlotState['round']]),
    ...R16_SLOT_IDS.map((id) => [id, 'R16'] as [string, KnockoutSlotState['round']]),
    ...QF_SLOT_IDS.map((id) => [id, 'QF'] as [string, KnockoutSlotState['round']]),
    ...SF_SLOT_IDS.map((id) => [id, 'SF'] as [string, KnockoutSlotState['round']]),
    [FINAL_SLOT_ID, 'FINAL'],
    [THIRD_SLOT_ID, 'THIRD'],
  ]
  for (const [id, round] of allIds) {
    slots[id] = { slotId: id, round, team1Id: null, team2Id: null, result: null }
  }
  return slots
}

export const useProgressStore = create<ProgressStore>()((set, get) => ({
  schedule: null,
  phase: 'idle',
  currentDay: 1,
  groupMatches: [],
  lastDayDate: null,
  lastDayGroupResults: [],
  lastDeltaByGroup: {},
  groupResults: null,
  qualifiedThirdGroups: [],
  knockoutSlots: emptySlots(),
  lastKnockoutResults: [],
  champion: null,

  initSchedule: () => {
    if (get().schedule) return
    set({ schedule: buildFullSchedule(), phase: 'group', currentDay: 1 })
  },

  reset: () => {
    set({
      schedule: buildFullSchedule(),
      phase: 'group',
      currentDay: 1,
      groupMatches: [],
      lastDayDate: null,
      lastDayGroupResults: [],
      lastDeltaByGroup: {},
      groupResults: null,
      qualifiedThirdGroups: [],
      knockoutSlots: emptySlots(),
      lastKnockoutResults: [],
      champion: null,
    })
  },

  advanceDay: () => {
    const state = get()
    if (!state.schedule) return

    if (state.phase === 'group') {
      const todays = state.schedule.groupMatches.filter((m) => m.day === state.currentDay)
      if (todays.length === 0) return
      const drawGroups = useDrawStore.getState().state.groups
      const touchedGroups = Array.from(new Set(todays.map((m) => m.group)))

      const before: Record<string, string[]> = {}
      for (const g of touchedGroups) {
        before[g] = rankGroupTeams(
          (drawGroups[g] as (string | null)[]).filter(Boolean) as string[],
          state.groupMatches.filter((m) => m.group === g),
        )
      }

      const newMatches: GroupMatch[] = todays.map((sm) => {
        const homeTeamId = drawGroups[sm.group][sm.homeSeed - 1]!
        const awayTeamId = drawGroups[sm.group][sm.awaySeed - 1]!
        const { homeGoals, awayGoals } = simulateMatch(homeTeamId, awayTeamId)
        return { group: sm.group, matchday: sm.matchday, homeTeamId, awayTeamId, homeGoals, awayGoals }
      })
      const updatedMatches = [...state.groupMatches, ...newMatches]

      const deltas: Record<string, Record<string, number>> = {}
      for (const g of touchedGroups) {
        const after = rankGroupTeams(
          (drawGroups[g] as (string | null)[]).filter(Boolean) as string[],
          updatedMatches.filter((m) => m.group === g),
        )
        const d: Record<string, number> = {}
        after.forEach((teamId, idx) => {
          d[teamId] = before[g].indexOf(teamId) - idx
        })
        deltas[g] = d
      }

      const nextDay = state.currentDay + 1
      if (nextDay > state.schedule.totalGroupStageDays) {
        const groupTeamsMap = Object.fromEntries(
          GROUP_LETTERS.map((g) => [g, (drawGroups[g] as (string | null)[]).filter(Boolean) as string[]]),
        ) as Record<GroupLetter, string[]>
        const groupResults = computeGroupResults(groupTeamsMap, updatedMatches)
        const qualifiedThirdGroups = computeQualifiedThirdGroups(groupResults, updatedMatches)
        const r32 = buildR32Matchups(groupResults, qualifiedThirdGroups)
        const slots = emptySlots()
        for (const m of r32) {
          slots[m.slotId] = { ...slots[m.slotId], team1Id: m.team1Id, team2Id: m.team2Id }
        }
        set({
          groupMatches: updatedMatches,
          lastDayGroupResults: newMatches,
          lastDayDate: todays[0]?.date ?? null,
          lastDeltaByGroup: deltas,
          currentDay: nextDay,
          phase: 'knockout',
          groupResults,
          qualifiedThirdGroups,
          knockoutSlots: slots,
        })
      } else {
        set({
          groupMatches: updatedMatches,
          lastDayGroupResults: newMatches,
          lastDayDate: todays[0]?.date ?? null,
          lastDeltaByGroup: deltas,
          currentDay: nextDay,
        })
      }
      return
    }

    if (state.phase === 'knockout') {
      const ready = state.schedule.knockoutMatches.filter((m) => {
        const slot = state.knockoutSlots[m.slotId]
        return slot && slot.team1Id && slot.team2Id && !slot.result
      })
      if (ready.length === 0) return
      const earliestDate = ready.reduce((min, m) => (m.date < min ? m.date : min), ready[0].date)
      const batch = ready.filter((m) => m.date === earliestDate)

      let slots = { ...state.knockoutSlots }
      const results: KnockoutMatch[] = []
      for (const m of batch) {
        const slot = slots[m.slotId]
        const sim = simulateKnockoutMatch(slot.team1Id!, slot.team2Id!)
        const km: KnockoutMatch = {
          round: m.round,
          slotId: m.slotId,
          homeTeamId: slot.team1Id!,
          awayTeamId: slot.team2Id!,
          homeGoals: sim.homeGoals,
          awayGoals: sim.awayGoals,
          wentToPenalties: sim.wentToPenalties,
          winnerTeamId: sim.winnerTeamId,
        }
        slots[m.slotId] = { ...slot, result: km }
        results.push(km)
      }
      slots = progressBracket(slots)

      const finalResult = slots[FINAL_SLOT_ID].result
      const thirdResult = slots[THIRD_SLOT_ID].result
      const phase: Phase = finalResult && thirdResult ? 'complete' : 'knockout'

      set({
        knockoutSlots: slots,
        lastKnockoutResults: results,
        lastDayDate: earliestDate,
        champion: finalResult?.winnerTeamId ?? null,
        phase,
      })
    }
  },
}))
