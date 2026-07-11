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
import { OPPONENT_FORECAST_ITERATIONS, SCENARIO_ITERATIONS } from './config'
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

export interface ForcedOutcome {
  teamId: string
  result: 'win' | 'draw' | 'loss'
}

/** forced 팀의 관점에서 원하는 결과(승/무/패)가 나올 때까지 다시 뽑는다(대부분 몇 번 안에 수렴). */
function simulateMatchWithForcedOutcome(
  homeTeamId: string,
  awayTeamId: string,
  forced: ForcedOutcome,
): { homeGoals: number; awayGoals: number } {
  const perspective = forced.teamId === homeTeamId ? 'home' : 'away'
  for (let attempt = 0; attempt < 300; attempt++) {
    const { homeGoals, awayGoals } = simulateMatch(homeTeamId, awayTeamId)
    const outcome =
      homeGoals === awayGoals ? 'draw' : (perspective === 'home') === homeGoals > awayGoals ? 'win' : 'loss'
    if (outcome === forced.result) return { homeGoals, awayGoals }
  }
  return simulateMatch(homeTeamId, awayTeamId)
}

interface FullTournamentRun {
  throughGroup: Set<string>
  slots: Record<string, KnockoutSlotState>
}

function simulateFullTournament(forced?: ForcedOutcome): FullTournamentRun {
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
      const isForcedFixture = forced && (homeTeamId === forced.teamId || awayTeamId === forced.teamId)
      const { homeGoals, awayGoals } = isForcedFixture
        ? simulateMatchWithForcedOutcome(homeTeamId, awayTeamId, forced)
        : simulateMatch(homeTeamId, awayTeamId)
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

  return { throughGroup, slots }
}

function simulateOneRun(forced?: ForcedOutcome): OneRunOutcome {
  const { throughGroup, slots } = simulateFullTournament(forced)

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

/**
 * 몬테카를로 누적기 — 반복을 여러 배치로 나눠 실행할 수 있게 해, UI를 멈추지 않고
 * 비동기 청크로 계산하고 진행률을 표시하며 중간에 취소할 수 있게 한다 (B1/B3).
 */
export function createSimulationAccumulator() {
  const counts: Record<string, TeamProbabilities> = Object.fromEntries(
    TEAMS.map((t) => [
      t.id,
      { teamId: t.id, groupStagePct: 0, r16Pct: 0, qfPct: 0, sfPct: 0, finalPct: 0, championPct: 0 },
    ]),
  )
  let done = 0

  return {
    get done() {
      return done
    },
    /** n회 시뮬레이션을 실행해 누적한다. */
    runBatch(n: number): void {
      for (let i = 0; i < n; i++) {
        const outcome = simulateOneRun()
        for (const id of outcome.throughGroup) counts[id].groupStagePct += 1
        for (const id of outcome.r16) counts[id].r16Pct += 1
        for (const id of outcome.qf) counts[id].qfPct += 1
        for (const id of outcome.sf) counts[id].sfPct += 1
        for (const id of outcome.final) counts[id].finalPct += 1
        if (outcome.champion) counts[outcome.champion].championPct += 1
      }
      done += n
    },
    /** 지금까지 누적된 결과를 확률(%)로 환산한다. */
    result(): SimulationResult {
      const probabilities: Record<string, TeamProbabilities> = {}
      const divisor = Math.max(1, done)
      for (const teamId of Object.keys(counts)) {
        const c = counts[teamId]
        probabilities[teamId] = {
          teamId,
          groupStagePct: (c.groupStagePct / divisor) * 100,
          r16Pct: (c.r16Pct / divisor) * 100,
          qfPct: (c.qfPct / divisor) * 100,
          sfPct: (c.sfPct / divisor) * 100,
          finalPct: (c.finalPct / divisor) * 100,
          championPct: (c.championPct / divisor) * 100,
        }
      }
      return { iterations: done, computedAt: Date.now(), probabilities }
    },
  }
}

/** 동기 일괄 실행(테스트/단발 계산용). UI에서는 비동기 청크 실행(useSimulationStore)을 쓴다. */
export function runMonteCarloSimulation(iterations: number): SimulationResult {
  const acc = createSimulationAccumulator()
  acc.runBatch(iterations)
  return acc.result()
}

export interface TeamScenarioResult {
  win: number
  draw: number
  loss: number
}

/** 해당 팀의 마지막 조별리그 경기 결과(승/무/패)를 가정했을 때 32강 진출 확률을 각각 산출한다. */
export function runTeamScenarioSimulation(teamId: string, iterations = SCENARIO_ITERATIONS): TeamScenarioResult {
  const outcomes: Array<'win' | 'draw' | 'loss'> = ['win', 'draw', 'loss']
  const result = {} as TeamScenarioResult
  for (const outcome of outcomes) {
    let advanced = 0
    for (let i = 0; i < iterations; i++) {
      const run = simulateOneRun({ teamId, result: outcome })
      if (run.throughGroup.has(teamId)) advanced += 1
    }
    result[outcome] = (advanced / iterations) * 100
  }
  return result
}

const OPPONENT_FORECAST_ROUNDS: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF', 'FINAL']

export interface RoundOpponentForecast {
  round: KnockoutRound
  /** 해당 라운드에 도달할 확률(%) */
  reachPct: number
  /** 도달했다는 조건 하에서의 상대별 확률(%), 내림차순 */
  opponents: { teamId: string; pct: number }[]
}

function findTeamMatchInRound(
  teamId: string,
  round: KnockoutRound,
  slots: Record<string, KnockoutSlotState>,
): { opponentId: string } | null {
  for (const id of ROUND_SLOT_IDS[round]) {
    const slot = slots[id]
    if (slot.team1Id === teamId && slot.team2Id) return { opponentId: slot.team2Id }
    if (slot.team2Id === teamId && slot.team1Id) return { opponentId: slot.team1Id }
  }
  return null
}

/** 라운드별로 이 팀이 만날 가능성이 높은 상대를 반복 시뮬레이션으로 예측한다(도달 조건부 확률). */
export function runOpponentForecast(teamId: string, iterations = OPPONENT_FORECAST_ITERATIONS): RoundOpponentForecast[] {
  const reachCounts: Record<KnockoutRound, number> = { R32: 0, R16: 0, QF: 0, SF: 0, THIRD: 0, FINAL: 0 }
  const opponentCounts: Record<KnockoutRound, Record<string, number>> = {
    R32: {},
    R16: {},
    QF: {},
    SF: {},
    THIRD: {},
    FINAL: {},
  }

  for (let i = 0; i < iterations; i++) {
    const { slots } = simulateFullTournament()
    for (const round of OPPONENT_FORECAST_ROUNDS) {
      const match = findTeamMatchInRound(teamId, round, slots)
      if (!match) continue
      reachCounts[round] += 1
      opponentCounts[round][match.opponentId] = (opponentCounts[round][match.opponentId] ?? 0) + 1
    }
  }

  return OPPONENT_FORECAST_ROUNDS.map((round) => {
    const reached = reachCounts[round]
    const opponents = Object.entries(opponentCounts[round])
      .map(([teamId, count]) => ({ teamId, pct: reached > 0 ? (count / reached) * 100 : 0 }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5)
    return { round, reachPct: (reached / iterations) * 100, opponents }
  })
}
