import { GROUP_LETTERS } from '../data/hostSlots'
import { TEAMS } from '../data/teams'
import {
  FINAL_SLOT_ID,
  QF_SLOT_IDS,
  R16_SLOT_IDS,
  R32_SLOT_IDS,
  ROUND_SLOT_IDS,
  SF_SLOT_IDS,
  THIRD_SLOT_ID,
} from '../data/bracketTemplate'
import { simulateKnockoutMatch, simulateMatch } from './matchEngine'
import {
  buildR32Matchups,
  computeGroupResults,
  computeQualifiedThirdGroups,
  progressBracket,
  type KnockoutSlotState,
} from './tournamentSimulation'
import { useDrawStore } from '../store/useDrawStore'
import { useProgressStore } from '../store/useProgressStore'
import type { GroupLetter } from '../types/group'
import type { GroupMatch, KnockoutMatch, KnockoutRound } from '../types/match'
import type { SimulationResult, TeamProbabilities } from '../types/simulation'

function simulateSlotMatch(round: KnockoutRound, slotId: string, team1Id: string, team2Id: string): KnockoutMatch {
  const sim = simulateKnockoutMatch(team1Id, team2Id)
  return {
    round,
    slotId,
    homeTeamId: team1Id,
    awayTeamId: team2Id,
    homeGoals: sim.homeGoals,
    awayGoals: sim.awayGoals,
    wentToPenalties: sim.wentToPenalties,
    winnerTeamId: sim.winnerTeamId,
  }
}

function emptyBracketSlots(): Record<string, KnockoutSlotState> {
  const slots: Record<string, KnockoutSlotState> = {}
  const push = (ids: string[], round: KnockoutRound) => {
    for (const id of ids) slots[id] = { slotId: id, round, team1Id: null, team2Id: null, result: null }
  }
  push(R32_SLOT_IDS, 'R32')
  push(R16_SLOT_IDS, 'R16')
  push(QF_SLOT_IDS, 'QF')
  push(SF_SLOT_IDS, 'SF')
  push([FINAL_SLOT_ID], 'FINAL')
  push([THIRD_SLOT_ID], 'THIRD')
  return slots
}

interface OneRunOutcome {
  throughGroup: Set<string>
  r16: Set<string>
  qf: Set<string>
  sf: Set<string>
  final: Set<string>
  champion: string | null
}

function simulateOneRun(): OneRunOutcome {
  const drawGroups = useDrawStore.getState().state.groups
  const progress = useProgressStore.getState()
  const schedule = progress.schedule

  const groupTeamsMap = Object.fromEntries(
    GROUP_LETTERS.map((g) => [g, (drawGroups[g] as (string | null)[]).filter(Boolean) as string[]]),
  ) as Record<GroupLetter, string[]>

  // 1) 확정된 결과 + 남은 조별리그 경기를 이번 회차만 랜덤 시뮬레이션하여 완전한 조별리그 결과를 만든다.
  const lockedMatches = progress.groupMatches
  const playedKeys = new Set(lockedMatches.map((m) => `${m.group}-${m.matchday}-${m.homeTeamId}-${m.awayTeamId}`))
  const fullGroupMatches: GroupMatch[] = [...lockedMatches]

  if (schedule) {
    for (const fx of schedule.groupMatches) {
      const homeTeamId = drawGroups[fx.group][fx.homeSeed - 1]
      const awayTeamId = drawGroups[fx.group][fx.awaySeed - 1]
      if (!homeTeamId || !awayTeamId) continue
      const key = `${fx.group}-${fx.matchday}-${homeTeamId}-${awayTeamId}`
      if (playedKeys.has(key)) continue
      const { homeGoals, awayGoals } = simulateMatch(homeTeamId, awayTeamId)
      fullGroupMatches.push({ group: fx.group, matchday: fx.matchday, homeTeamId, awayTeamId, homeGoals, awayGoals })
    }
  }

  const groupResults = computeGroupResults(groupTeamsMap, fullGroupMatches)
  const qualifiedThirdGroups = computeQualifiedThirdGroups(groupResults, fullGroupMatches)
  const r32Pairing = buildR32Matchups(groupResults, qualifiedThirdGroups)

  const throughGroup = new Set<string>()
  for (const m of r32Pairing) {
    throughGroup.add(m.team1Id)
    throughGroup.add(m.team2Id)
  }

  // 2) R32부터 결승까지 진행 — 이미 확정된 실제 결과는 그대로 쓰고, 나머지만 시뮬레이션한다.
  let slots = emptyBracketSlots()
  for (const m of r32Pairing) {
    slots[m.slotId] = { ...slots[m.slotId], team1Id: m.team1Id, team2Id: m.team2Id }
  }
  const lockedSlots = progress.knockoutSlots

  const rounds: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF']
  for (const round of rounds) {
    for (const id of ROUND_SLOT_IDS[round]) {
      const slot = slots[id]
      if (slot.team1Id && slot.team2Id && !slot.result) {
        const locked = lockedSlots[id]?.result
        slot.result = locked ?? simulateSlotMatch(round, id, slot.team1Id, slot.team2Id)
      }
    }
    slots = progressBracket(slots)
  }
  for (const id of [FINAL_SLOT_ID, THIRD_SLOT_ID] as const) {
    const slot = slots[id]
    if (slot.team1Id && slot.team2Id && !slot.result) {
      const locked = lockedSlots[id]?.result
      slot.result = locked ?? simulateSlotMatch(slot.round, id, slot.team1Id, slot.team2Id)
    }
  }

  const r16 = new Set<string>()
  const qf = new Set<string>()
  const sf = new Set<string>()
  const final = new Set<string>()
  for (const id of R32_SLOT_IDS) if (slots[id].result) r16.add(slots[id].result!.winnerTeamId)
  for (const id of R16_SLOT_IDS) if (slots[id].result) qf.add(slots[id].result!.winnerTeamId)
  for (const id of QF_SLOT_IDS) if (slots[id].result) sf.add(slots[id].result!.winnerTeamId)
  for (const id of SF_SLOT_IDS) if (slots[id].result) final.add(slots[id].result!.winnerTeamId)
  const champion = slots[FINAL_SLOT_ID].result?.winnerTeamId ?? null

  return { throughGroup, r16, qf, sf, final, champion }
}

export function runMonteCarloSimulation(iterations: number): SimulationResult {
  const counts: Record<string, TeamProbabilities> = Object.fromEntries(
    TEAMS.map((t) => [
      t.id,
      { teamId: t.id, groupStagePct: 0, r16Pct: 0, qfPct: 0, sfPct: 0, finalPct: 0, championPct: 0 },
    ]),
  )

  for (let i = 0; i < iterations; i++) {
    const outcome = simulateOneRun()
    for (const id of outcome.throughGroup) counts[id].groupStagePct += 1
    for (const id of outcome.r16) counts[id].r16Pct += 1
    for (const id of outcome.qf) counts[id].qfPct += 1
    for (const id of outcome.sf) counts[id].sfPct += 1
    for (const id of outcome.final) counts[id].finalPct += 1
    if (outcome.champion) counts[outcome.champion].championPct += 1
  }

  for (const teamId of Object.keys(counts)) {
    const c = counts[teamId]
    c.groupStagePct = (c.groupStagePct / iterations) * 100
    c.r16Pct = (c.r16Pct / iterations) * 100
    c.qfPct = (c.qfPct / iterations) * 100
    c.sfPct = (c.sfPct / iterations) * 100
    c.finalPct = (c.finalPct / iterations) * 100
    c.championPct = (c.championPct / iterations) * 100
  }

  return { iterations, computedAt: Date.now(), probabilities: counts }
}
