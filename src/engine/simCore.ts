import { GROUP_LETTERS } from '../data/hostSlots'
import {
  FINAL_SLOT_ID,
  QF_SLOT_IDS,
  R16_SLOT_IDS,
  R32_SLOT_IDS,
  ROUND_SLOT_IDS,
  SF_SLOT_IDS,
  THIRD_SLOT_ID,
} from '../data/bracketTemplate'
import {
  buildR32Matchups,
  computeGroupResults,
  computeQualifiedThirdGroups,
  progressBracket,
  type KnockoutSlotState,
} from './tournamentSimulation'
import { simulateKnockout, simulateScore, type RandomFn } from './matchCore'
import type { GroupLetter } from '../types/group'
import type { GroupMatch, KnockoutMatch, KnockoutRound } from '../types/match'
import type { ScheduledGroupMatch } from '../types/schedule'
import type { TeamRatings } from '../types/team'
import type { SimulationResult, TeamProbabilities } from '../types/simulation'

/**
 * 시뮬레이션에 필요한 모든 상태를 담은 직렬화 가능한 스냅샷 (v2 #42 / H1).
 * store를 읽지 않으므로 이 스냅샷 하나로 Web Worker에서 완전한 시뮬레이션을 돌릴 수 있다.
 */
export interface SimSnapshot {
  drawGroups: Record<GroupLetter, (string | null)[]>
  scheduleGroupMatches: ScheduledGroupMatch[] | null
  lockedGroupMatches: GroupMatch[]
  lockedKnockoutResults: Record<string, KnockoutMatch | null>
  /** 팀 ID → 이번 대회 유효 능력치(컨디션·모멘텀·샌드박스 반영 완료) */
  ratings: Record<string, TeamRatings>
}

export interface ForcedOutcome {
  teamId: string
  result: 'win' | 'draw' | 'loss'
}

function ratingOf(snap: SimSnapshot, teamId: string): TeamRatings {
  return snap.ratings[teamId]
}

function simulateSlotMatch(
  snap: SimSnapshot,
  round: KnockoutRound,
  slotId: string,
  team1Id: string,
  team2Id: string,
  rand: RandomFn,
): KnockoutMatch {
  const sim = simulateKnockout(team1Id, ratingOf(snap, team1Id), team2Id, ratingOf(snap, team2Id), rand)
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

/** forced 팀 관점에서 원하는 결과가 나올 때까지 다시 뽑는다(대부분 몇 번 안에 수렴). */
function simulateMatchWithForcedOutcome(
  snap: SimSnapshot,
  homeTeamId: string,
  awayTeamId: string,
  forced: ForcedOutcome,
  rand: RandomFn,
): { homeGoals: number; awayGoals: number } {
  const perspective = forced.teamId === homeTeamId ? 'home' : 'away'
  const run = () => simulateScore(homeTeamId, ratingOf(snap, homeTeamId), awayTeamId, ratingOf(snap, awayTeamId), rand)
  for (let attempt = 0; attempt < 300; attempt++) {
    const { homeGoals, awayGoals } = run()
    const outcome =
      homeGoals === awayGoals ? 'draw' : (perspective === 'home') === homeGoals > awayGoals ? 'win' : 'loss'
    if (outcome === forced.result) return { homeGoals, awayGoals }
  }
  return run()
}

interface FullTournamentRun {
  throughGroup: Set<string>
  slots: Record<string, KnockoutSlotState>
}

export function simulateFullTournament(snap: SimSnapshot, rand: RandomFn, forced?: ForcedOutcome): FullTournamentRun {
  const drawGroups = snap.drawGroups

  const groupTeamsMap = Object.fromEntries(
    GROUP_LETTERS.map((g) => [g, (drawGroups[g] as (string | null)[]).filter(Boolean) as string[]]),
  ) as Record<GroupLetter, string[]>

  // 1) 확정된 결과 + 남은 조별리그 경기를 이번 회차만 랜덤 시뮬레이션하여 완전한 조별리그 결과를 만든다.
  const lockedMatches = snap.lockedGroupMatches
  const playedKeys = new Set(lockedMatches.map((m) => `${m.group}-${m.matchday}-${m.homeTeamId}-${m.awayTeamId}`))
  const fullGroupMatches: GroupMatch[] = [...lockedMatches]

  if (snap.scheduleGroupMatches) {
    for (const fx of snap.scheduleGroupMatches) {
      const homeTeamId = drawGroups[fx.group][fx.homeSeed - 1]
      const awayTeamId = drawGroups[fx.group][fx.awaySeed - 1]
      if (!homeTeamId || !awayTeamId) continue
      const key = `${fx.group}-${fx.matchday}-${homeTeamId}-${awayTeamId}`
      if (playedKeys.has(key)) continue
      const isForcedFixture = forced && (homeTeamId === forced.teamId || awayTeamId === forced.teamId)
      const { homeGoals, awayGoals } = isForcedFixture
        ? simulateMatchWithForcedOutcome(snap, homeTeamId, awayTeamId, forced, rand)
        : simulateScore(homeTeamId, ratingOf(snap, homeTeamId), awayTeamId, ratingOf(snap, awayTeamId), rand)
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
  const lockedSlots = snap.lockedKnockoutResults

  const rounds: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF']
  for (const round of rounds) {
    for (const id of ROUND_SLOT_IDS[round]) {
      const slot = slots[id]
      if (slot.team1Id && slot.team2Id && !slot.result) {
        const locked = lockedSlots[id]
        slot.result = locked ?? simulateSlotMatch(snap, round, id, slot.team1Id, slot.team2Id, rand)
      }
    }
    slots = progressBracket(slots)
  }
  for (const id of [FINAL_SLOT_ID, THIRD_SLOT_ID] as const) {
    const slot = slots[id]
    if (slot.team1Id && slot.team2Id && !slot.result) {
      const locked = lockedSlots[id]
      slot.result = locked ?? simulateSlotMatch(snap, slot.round, id, slot.team1Id, slot.team2Id, rand)
    }
  }

  return { throughGroup, slots }
}

interface OneRunOutcome {
  throughGroup: Set<string>
  r16: Set<string>
  qf: Set<string>
  sf: Set<string>
  final: Set<string>
  champion: string | null
}

function simulateOneRun(snap: SimSnapshot, rand: RandomFn, forced?: ForcedOutcome): OneRunOutcome {
  const { throughGroup, slots } = simulateFullTournament(snap, rand, forced)
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

/** 몬테카를로 누적기(배치 실행 가능). rand 미지정 시 Math.random. */
export function createSimulationAccumulator(snap: SimSnapshot, rand: RandomFn = Math.random) {
  // 확률 집계 대상은 "실제 이번 대회에 편성된 48팀"(스냅샷의 조 편성)이다. 예선으로 편성이
  // 달라져도(비본선 국가 진출 등) 항상 실제 참가팀 기준으로 집계한다.
  const fieldTeams = Object.values(snap.drawGroups)
    .flat()
    .filter((id): id is string => Boolean(id))
  const counts: Record<string, TeamProbabilities> = Object.fromEntries(
    fieldTeams.map((id) => [
      id,
      { teamId: id, groupStagePct: 0, r16Pct: 0, qfPct: 0, sfPct: 0, finalPct: 0, championPct: 0 },
    ]),
  )
  let done = 0
  return {
    get done() {
      return done
    },
    runBatch(n: number): void {
      // 스냅샷의 참가팀 기준으로 counts를 초기화하므로 이론상 모든 outcome id가 존재하지만,
      // 조추첨 초기화 중 스냅샷/추첨 불일치 같은 경계 상황에서도 크래시하지 않도록 방어적으로 집계한다.
      const bump = (id: string, key: keyof TeamProbabilities): void => {
        const c = counts[id]
        if (c) (c[key] as number) += 1
      }
      for (let i = 0; i < n; i++) {
        const outcome = simulateOneRun(snap, rand)
        for (const id of outcome.throughGroup) bump(id, 'groupStagePct')
        for (const id of outcome.r16) bump(id, 'r16Pct')
        for (const id of outcome.qf) bump(id, 'qfPct')
        for (const id of outcome.sf) bump(id, 'sfPct')
        for (const id of outcome.final) bump(id, 'finalPct')
        if (outcome.champion) bump(outcome.champion, 'championPct')
      }
      done += n
    },
    result(computedAt: number): SimulationResult {
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
      return { iterations: done, computedAt, probabilities }
    },
  }
}

export interface TeamScenarioResult {
  win: number
  draw: number
  loss: number
}

export function runTeamScenario(snap: SimSnapshot, teamId: string, iterations: number): TeamScenarioResult {
  const outcomes: Array<'win' | 'draw' | 'loss'> = ['win', 'draw', 'loss']
  const result = {} as TeamScenarioResult
  for (const outcome of outcomes) {
    let advanced = 0
    for (let i = 0; i < iterations; i++) {
      const run = simulateOneRun(snap, Math.random, { teamId, result: outcome })
      if (run.throughGroup.has(teamId)) advanced += 1
    }
    result[outcome] = (advanced / iterations) * 100
  }
  return result
}

const OPPONENT_FORECAST_ROUNDS: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF', 'FINAL']

export interface RoundOpponentForecast {
  round: KnockoutRound
  reachPct: number
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

export function runOpponentForecast(snap: SimSnapshot, teamId: string, iterations: number): RoundOpponentForecast[] {
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
    const { slots } = simulateFullTournament(snap, Math.random)
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
      .map(([tid, count]) => ({ teamId: tid, pct: reached > 0 ? (count / reached) * 100 : 0 }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5)
    return { round, reachPct: (reached / iterations) * 100, opponents }
  })
}
