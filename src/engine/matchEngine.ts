import { TEAMS_BY_ID } from '../data/teams'
import { useSandboxStore } from '../store/useSandboxStore'
import type { TeamRatings } from '../types/team'

const HOST_ADVANTAGE = 6

export function getRatings(teamId: string): TeamRatings {
  const team = TEAMS_BY_ID[teamId]
  const override = useSandboxStore.getState().overrides[teamId]
  return override ? { ...team.baseRatings, ...override } : team.baseRatings
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function expectedGoals(attacker: TeamRatings, defender: TeamRatings, isHostTeam: boolean): number {
  const strengthDiff = attacker.attack - defender.defense + (attacker.form - 70) * 0.25 + (isHostTeam ? HOST_ADVANTAGE : 0)
  return clamp(1.3 + strengthDiff / 22, 0.15, 4.6)
}

function samplePoisson(lambda: number): number {
  const limit = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k += 1
    p *= Math.random()
  } while (p > limit)
  return k - 1
}

export interface SimulatedScore {
  homeGoals: number
  awayGoals: number
}

export function simulateMatch(homeTeamId: string, awayTeamId: string): SimulatedScore {
  const home = getRatings(homeTeamId)
  const away = getRatings(awayTeamId)
  const homeIsHost = TEAMS_BY_ID[homeTeamId].isHost
  const awayIsHost = TEAMS_BY_ID[awayTeamId].isHost

  const homeLambda = expectedGoals(home, away, homeIsHost)
  const awayLambda = expectedGoals(away, home, awayIsHost)

  return {
    homeGoals: samplePoisson(homeLambda),
    awayGoals: samplePoisson(awayLambda),
  }
}

export interface SimulatedKnockoutScore extends SimulatedScore {
  wentToPenalties: boolean
  winnerTeamId: string
}

/** 무승부 시 승부차기로 승자를 결정한다(능력치 기반 확률 + 약간의 변수). */
export function simulateKnockoutMatch(homeTeamId: string, awayTeamId: string): SimulatedKnockoutScore {
  const { homeGoals, awayGoals } = simulateMatch(homeTeamId, awayTeamId)
  if (homeGoals !== awayGoals) {
    return {
      homeGoals,
      awayGoals,
      wentToPenalties: false,
      winnerTeamId: homeGoals > awayGoals ? homeTeamId : awayTeamId,
    }
  }

  const home = getRatings(homeTeamId)
  const away = getRatings(awayTeamId)
  const homeStrength = home.overall + home.form * 0.2 + 50
  const awayStrength = away.overall + away.form * 0.2 + 50
  const homeWinProb = homeStrength / (homeStrength + awayStrength)

  return {
    homeGoals,
    awayGoals,
    wentToPenalties: true,
    winnerTeamId: Math.random() < homeWinProb ? homeTeamId : awayTeamId,
  }
}
