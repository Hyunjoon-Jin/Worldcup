import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { GROUP_LETTERS } from '../data/hostSlots'
import {
  FINAL_SLOT_ID,
  QF_SLOT_IDS,
  R16_SLOT_IDS,
  R32_SLOT_IDS,
  SF_SLOT_IDS,
  THIRD_SLOT_ID,
} from '../data/bracketTemplate'
import { buildFullSchedule, TIME_SLOTS } from '../engine/scheduleEngine'
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
import type { ScheduledGroupMatch, ScheduledKnockoutMatch, TournamentSchedule } from '../types/schedule'

type Phase = 'idle' | 'group' | 'knockout' | 'complete'

interface ProgressStore {
  schedule: TournamentSchedule | null
  phase: Phase
  currentDay: number
  groupMatches: GroupMatch[]
  lastBatchDate: string | null
  /** 마지막으로 진행한 배치의 시간대 라벨. 하루 전체를 한 번에 진행했다면 null. */
  lastBatchTimeSlot: string | null
  lastDayGroupResults: GroupMatch[]
  lastDeltaByGroup: Record<string, Record<string, number>>
  groupResults: Record<GroupLetter, GroupResult> | null
  qualifiedThirdGroups: GroupLetter[]
  knockoutSlots: Record<string, KnockoutSlotState>
  lastKnockoutResults: KnockoutMatch[]
  champion: string | null
  initSchedule: () => void
  /** 현재 날짜/일정에 남아있는 경기를 모두 진행한다(기존 "다음 날 진행" 동작). */
  advanceDay: () => void
  /** 현재 날짜/일정에서 가장 이른 시간대 경기 한 타임만 진행한다. */
  advanceTimeSlot: () => void
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

function groupMatchKey(group: string, matchday: number, homeTeamId: string, awayTeamId: string): string {
  return `${group}-${matchday}-${homeTeamId}-${awayTeamId}`
}

function bySlotOrder(a: string, b: string): number {
  return TIME_SLOTS.indexOf(a) - TIME_SLOTS.indexOf(b)
}

/** 지정한 날짜의 아직 진행하지 않은 예정 경기 중, 가장 이른 시간대에 해당하는 경기들만 골라낸다. */
export function nextPendingGroupSlot(
  schedule: TournamentSchedule,
  playedMatches: GroupMatch[],
  day: number,
): { timeSlot: string; fixtures: ScheduledGroupMatch[]; remainingAfter: boolean } | null {
  const playedKeys = new Set(playedMatches.map((m) => groupMatchKey(m.group, m.matchday, m.homeTeamId, m.awayTeamId)))
  const drawGroups = useDrawStore.getState().state.groups
  const dayFixtures = schedule.groupMatches.filter((m) => m.day === day)
  const pending = dayFixtures.filter((fx) => {
    const homeTeamId = drawGroups[fx.group][fx.homeSeed - 1]
    const awayTeamId = drawGroups[fx.group][fx.awaySeed - 1]
    if (!homeTeamId || !awayTeamId) return false
    return !playedKeys.has(groupMatchKey(fx.group, fx.matchday, homeTeamId, awayTeamId))
  })
  if (pending.length === 0) return null

  const nextSlot = [...new Set(pending.map((f) => f.timeSlot))].sort(bySlotOrder)[0]
  const fixtures = pending.filter((f) => f.timeSlot === nextSlot)
  const remainingAfter = pending.length > fixtures.length
  return { timeSlot: nextSlot, fixtures, remainingAfter }
}

/** 지정한 날짜/시간대 경기들을 시뮬레이션하고 결과·순위 변동을 계산한다(스토어에 커밋하지 않음). */
function simulateGroupFixtures(fixtures: ScheduledGroupMatch[], priorMatches: GroupMatch[]) {
  const drawGroups = useDrawStore.getState().state.groups
  const touchedGroups = Array.from(new Set(fixtures.map((m) => m.group)))

  const before: Record<string, string[]> = {}
  for (const g of touchedGroups) {
    before[g] = rankGroupTeams(
      (drawGroups[g] as (string | null)[]).filter(Boolean) as string[],
      priorMatches.filter((m) => m.group === g),
    )
  }

  const newMatches: GroupMatch[] = fixtures.map((sm) => {
    const homeTeamId = drawGroups[sm.group][sm.homeSeed - 1]!
    const awayTeamId = drawGroups[sm.group][sm.awaySeed - 1]!
    const { homeGoals, awayGoals } = simulateMatch(homeTeamId, awayTeamId)
    return { group: sm.group, matchday: sm.matchday, homeTeamId, awayTeamId, homeGoals, awayGoals }
  })
  const updatedMatches = [...priorMatches, ...newMatches]

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

  return { newMatches, updatedMatches, deltas }
}

function buildKnockoutBracketFromGroups(schedule: TournamentSchedule, updatedMatches: GroupMatch[]) {
  const drawGroups = useDrawStore.getState().state.groups
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
  void schedule
  return { groupResults, qualifiedThirdGroups, slots }
}

/** 다음으로 진행 가능한(팀이 모두 확정된) 가장 이른 날짜의 토너먼트 경기들 중, 가장 이른 시간대만 골라낸다. */
export function nextPendingKnockoutSlot(
  schedule: TournamentSchedule,
  knockoutSlots: Record<string, KnockoutSlotState>,
): { date: string; timeSlot: string; fixtures: ScheduledKnockoutMatch[] } | null {
  const ready = schedule.knockoutMatches.filter((m) => {
    const slot = knockoutSlots[m.slotId]
    return slot && slot.team1Id && slot.team2Id && !slot.result
  })
  if (ready.length === 0) return null
  const earliestDate = ready.reduce((min, m) => (m.date < min ? m.date : min), ready[0].date)
  const sameDate = ready.filter((m) => m.date === earliestDate)
  const nextSlot = [...new Set(sameDate.map((f) => f.timeSlot))].sort(bySlotOrder)[0]
  return { date: earliestDate, timeSlot: nextSlot, fixtures: sameDate.filter((f) => f.timeSlot === nextSlot) }
}

function simulateKnockoutFixtures(fixtures: ScheduledKnockoutMatch[], knockoutSlots: Record<string, KnockoutSlotState>) {
  let slots = { ...knockoutSlots }
  const results: KnockoutMatch[] = []
  for (const m of fixtures) {
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
  return { slots, results }
}

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set, get) => ({
  schedule: null,
  phase: 'idle',
  currentDay: 1,
  groupMatches: [],
  lastBatchDate: null,
  lastBatchTimeSlot: null,
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
      lastBatchDate: null,
      lastBatchTimeSlot: null,
      lastDayGroupResults: [],
      lastDeltaByGroup: {},
      groupResults: null,
      qualifiedThirdGroups: [],
      knockoutSlots: emptySlots(),
      lastKnockoutResults: [],
      champion: null,
    })
  },

  advanceTimeSlot: () => {
    const state = get()
    if (!state.schedule) return

    if (state.phase === 'group') {
      const pending = nextPendingGroupSlot(state.schedule, state.groupMatches, state.currentDay)
      if (!pending) return
      const { newMatches, updatedMatches, deltas } = simulateGroupFixtures(pending.fixtures, state.groupMatches)

      if (!pending.remainingAfter) {
        const nextDay = state.currentDay + 1
        if (nextDay > state.schedule.totalGroupStageDays) {
          const { groupResults, qualifiedThirdGroups, slots } = buildKnockoutBracketFromGroups(state.schedule, updatedMatches)
          set({
            groupMatches: updatedMatches,
            lastDayGroupResults: newMatches,
            lastBatchDate: pending.fixtures[0]?.date ?? null,
            lastBatchTimeSlot: pending.timeSlot,
            lastDeltaByGroup: deltas,
            currentDay: nextDay,
            phase: 'knockout',
            groupResults,
            qualifiedThirdGroups,
            knockoutSlots: slots,
          })
          return
        }
        set({
          groupMatches: updatedMatches,
          lastDayGroupResults: newMatches,
          lastBatchDate: pending.fixtures[0]?.date ?? null,
          lastBatchTimeSlot: pending.timeSlot,
          lastDeltaByGroup: deltas,
          currentDay: nextDay,
        })
        return
      }

      set({
        groupMatches: updatedMatches,
        lastDayGroupResults: newMatches,
        lastBatchDate: pending.fixtures[0]?.date ?? null,
        lastBatchTimeSlot: pending.timeSlot,
        lastDeltaByGroup: deltas,
      })
      return
    }

    if (state.phase === 'knockout') {
      const pending = nextPendingKnockoutSlot(state.schedule, state.knockoutSlots)
      if (!pending) return
      const { slots, results } = simulateKnockoutFixtures(pending.fixtures, state.knockoutSlots)
      const finalResult = slots[FINAL_SLOT_ID].result
      const thirdResult = slots[THIRD_SLOT_ID].result
      const phase: Phase = finalResult && thirdResult ? 'complete' : 'knockout'
      set({
        knockoutSlots: slots,
        lastKnockoutResults: results,
        lastDayGroupResults: [],
        lastDeltaByGroup: {},
        lastBatchDate: pending.date,
        lastBatchTimeSlot: pending.timeSlot,
        champion: finalResult?.winnerTeamId ?? null,
        phase,
      })
    }
  },

  advanceDay: () => {
    const state = get()
    if (!state.schedule) return

    if (state.phase === 'group') {
      const startDay = state.currentDay
      let groupMatches = state.groupMatches
      const allNewMatches: GroupMatch[] = []
      const combinedDeltas: Record<string, Record<string, number>> = {}
      let currentDay = state.currentDay
      let batchDate: string | null = null
      let transitionedToKnockout: ReturnType<typeof buildKnockoutBracketFromGroups> | null = null

      while (currentDay === startDay) {
        const pending = nextPendingGroupSlot(state.schedule, groupMatches, currentDay)
        if (!pending) break
        const { newMatches, updatedMatches, deltas } = simulateGroupFixtures(pending.fixtures, groupMatches)
        groupMatches = updatedMatches
        allNewMatches.push(...newMatches)
        Object.assign(combinedDeltas, deltas)
        batchDate = pending.fixtures[0]?.date ?? batchDate
        if (!pending.remainingAfter) {
          currentDay += 1
          if (currentDay > state.schedule.totalGroupStageDays) {
            transitionedToKnockout = buildKnockoutBracketFromGroups(state.schedule, groupMatches)
          }
        }
      }

      if (allNewMatches.length === 0) return

      if (transitionedToKnockout) {
        set({
          groupMatches,
          lastDayGroupResults: allNewMatches,
          lastBatchDate: batchDate,
          lastBatchTimeSlot: null,
          lastDeltaByGroup: combinedDeltas,
          currentDay,
          phase: 'knockout',
          groupResults: transitionedToKnockout.groupResults,
          qualifiedThirdGroups: transitionedToKnockout.qualifiedThirdGroups,
          knockoutSlots: transitionedToKnockout.slots,
        })
      } else {
        set({
          groupMatches,
          lastDayGroupResults: allNewMatches,
          lastBatchDate: batchDate,
          lastBatchTimeSlot: null,
          lastDeltaByGroup: combinedDeltas,
          currentDay,
        })
      }
      return
    }

    if (state.phase === 'knockout') {
      const pending = nextPendingKnockoutSlot(state.schedule, state.knockoutSlots)
      if (!pending) return
      const startDate = pending.date
      let knockoutSlots = state.knockoutSlots
      const allResults: KnockoutMatch[] = []

      for (;;) {
        const next = nextPendingKnockoutSlot(state.schedule, knockoutSlots)
        if (!next || next.date !== startDate) break
        const { slots, results } = simulateKnockoutFixtures(next.fixtures, knockoutSlots)
        knockoutSlots = slots
        allResults.push(...results)
      }

      const finalResult = knockoutSlots[FINAL_SLOT_ID].result
      const thirdResult = knockoutSlots[THIRD_SLOT_ID].result
      const phase: Phase = finalResult && thirdResult ? 'complete' : 'knockout'

      set({
        knockoutSlots,
        lastKnockoutResults: allResults,
        lastDayGroupResults: [],
        lastDeltaByGroup: {},
        lastBatchDate: startDate,
        lastBatchTimeSlot: null,
        champion: finalResult?.winnerTeamId ?? null,
        phase,
      })
    }
  },
    }),
    {
      name: 'wc2026-progress-store',
      version: 1,
      // 액션 함수는 저장하지 않고, 진행 데이터만 영속화한다(A1). schedule은 결정론적이라
      // 저장해도 무방하며, 복원 후 initSchedule이 존재하면 재생성하지 않는다.
      partialize: (state) => ({
        schedule: state.schedule,
        phase: state.phase,
        currentDay: state.currentDay,
        groupMatches: state.groupMatches,
        lastBatchDate: state.lastBatchDate,
        lastBatchTimeSlot: state.lastBatchTimeSlot,
        lastDayGroupResults: state.lastDayGroupResults,
        lastDeltaByGroup: state.lastDeltaByGroup,
        groupResults: state.groupResults,
        qualifiedThirdGroups: state.qualifiedThirdGroups,
        knockoutSlots: state.knockoutSlots,
        lastKnockoutResults: state.lastKnockoutResults,
        champion: state.champion,
      }),
    },
  ),
)
