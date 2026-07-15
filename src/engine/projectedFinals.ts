import { computePots, runSeededDraw } from './drawEngine'
import { buildFullSchedule } from './scheduleEngine'
import { simulateFullTournament, type RoundOpponentForecast } from './simCore'
import { ROUND_SLOT_IDS } from '../data/bracketTemplate'
import type { KnockoutRound } from '../types/match'
import type { TeamRatings } from '../types/team'
import type { SimSnapshot } from './simCore'
import type { KnockoutSlotState } from './tournamentSimulation'

/** 본선 조추첨 전 '예상' 본선 성적 — 무작위 조편성으로 여러 번 시뮬레이션해 라운드 도달 확률·예상 상대를 낸다. */
export interface ProjectedFinals {
  /** 예상 48강 명단에 이 팀이 포함되는지(현재 예선 예상 기준). false면 라운드 확률은 의미 없다. */
  inField: boolean
  /** 라운드별 도달 확률(%) — 32강 진출 / 16강 / 8강 / 4강 / 결승 / 우승. */
  reach: { groupStage: number; r16: number; qf: number; sf: number; final: number; champion: number }
  /** 라운드별 예상 상대(무작위 조편성 평균). */
  opponents: RoundOpponentForecast[]
}

const OPP_ROUNDS: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF', 'FINAL']

function opponentInRound(teamId: string, round: KnockoutRound, slots: Record<string, KnockoutSlotState>): string | null {
  for (const id of ROUND_SLOT_IDS[round]) {
    const slot = slots[id]
    if (slot.team1Id === teamId && slot.team2Id) return slot.team2Id
    if (slot.team2Id === teamId && slot.team1Id) return slot.team1Id
  }
  return null
}

/**
 * 예상 본선 성적 계산. field48(현재 예선 예상 진출 48개국)을 매 반복마다 무작위로 조추첨해 본선을 끝까지
 * 시뮬레이션하고, 대상 팀의 라운드 도달 빈도와 각 라운드 상대를 집계한다. 조편성이 매번 달라지므로
 * '조추첨 전' 시점의 기대값이 된다. rand는 경기 시뮬(Math.random)에 쓰고, 조추첨은 반복별 시드로 다양화한다.
 */
export function runProjectedFinalsForTeam(
  field48: string[],
  ratings: Record<string, TeamRatings>,
  teamId: string,
  iterations: number,
  seedBase: string,
): ProjectedFinals {
  const empty: ProjectedFinals = {
    inField: false,
    reach: { groupStage: 0, r16: 0, qf: 0, sf: 0, final: 0, champion: 0 },
    opponents: [],
  }
  if (!field48.includes(teamId) || field48.length < 32) return empty

  const pots = computePots(field48)
  const scheduleGroupMatches = buildFullSchedule().groupMatches

  const reach = { groupStage: 0, r16: 0, qf: 0, sf: 0, final: 0, champion: 0 }
  const reachCounts: Record<KnockoutRound, number> = { R32: 0, R16: 0, QF: 0, SF: 0, THIRD: 0, FINAL: 0 }
  const oppCounts: Record<KnockoutRound, Record<string, number>> = {
    R32: {}, R16: {}, QF: {}, SF: {}, THIRD: {}, FINAL: {},
  }

  for (let i = 0; i < iterations; i++) {
    const { state } = runSeededDraw(`${seedBase}-D${i}`, pots)
    const snap: SimSnapshot = {
      drawGroups: state.groups,
      scheduleGroupMatches,
      lockedGroupMatches: [],
      lockedKnockoutResults: {},
      ratings,
    }
    const { throughGroup, slots } = simulateFullTournament(snap, Math.random)
    if (throughGroup.has(teamId)) reach.groupStage += 1

    // 라운드별 도달(그 라운드 경기에 팀이 편성되면 도달) + 상대 집계.
    for (const round of OPP_ROUNDS) {
      const opp = opponentInRound(teamId, round, slots)
      if (opp == null) continue
      reachCounts[round] += 1
      oppCounts[round][opp] = (oppCounts[round][opp] ?? 0) + 1
    }
    // 승리로 다음 라운드 진출 집계.
    for (const id of ROUND_SLOT_IDS.R32) if (slots[id].result?.winnerTeamId === teamId) reach.r16 += 1
    for (const id of ROUND_SLOT_IDS.R16) if (slots[id].result?.winnerTeamId === teamId) reach.qf += 1
    for (const id of ROUND_SLOT_IDS.QF) if (slots[id].result?.winnerTeamId === teamId) reach.sf += 1
    for (const id of ROUND_SLOT_IDS.SF) if (slots[id].result?.winnerTeamId === teamId) reach.final += 1
    if (slots.FINAL.result?.winnerTeamId === teamId) reach.champion += 1
  }

  const pct = (n: number) => (n / iterations) * 100
  const opponents: RoundOpponentForecast[] = OPP_ROUNDS.map((round) => {
    const reached = reachCounts[round]
    const opponents = Object.entries(oppCounts[round])
      .map(([tid, count]) => ({ teamId: tid, pct: reached > 0 ? (count / reached) * 100 : 0 }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5)
    return { round, reachPct: pct(reached), opponents }
  })

  return {
    inField: true,
    reach: {
      groupStage: pct(reach.groupStage),
      r16: pct(reach.r16),
      qf: pct(reach.qf),
      sf: pct(reach.sf),
      final: pct(reach.final),
      champion: pct(reach.champion),
    },
    opponents,
  }
}
