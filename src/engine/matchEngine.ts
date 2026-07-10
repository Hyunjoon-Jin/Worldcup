import { TEAMS_BY_ID } from '../data/teams'
import { useSandboxStore } from '../store/useSandboxStore'
import type { TeamRatings } from '../types/team'

const HOST_ADVANTAGE = 5

export function getRatings(teamId: string): TeamRatings {
  const team = TEAMS_BY_ID[teamId]
  const override = useSandboxStore.getState().overrides[teamId]
  return override ? { ...team.baseRatings, ...override } : team.baseRatings
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// 실제 축구 경기의 평균 득점(팀당 약 1.3골)에 가깝게 보정하고, 극단적인 능력치 차이에서도
// 대량 득점 블로아웃이 지나치게 자주 나오지 않도록 민감도를 낮추고 상하한을 좁혔다.
function expectedGoals(attacker: TeamRatings, defender: TeamRatings, isHostTeam: boolean): number {
  const strengthDiff = attacker.attack - defender.defense + (attacker.form - 70) * 0.15 + (isHostTeam ? HOST_ADVANTAGE : 0)
  return clamp(1.25 + strengthDiff / 38, 0.35, 3.1)
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

const UPSET_RATING_GAP = 8

/** 승자의 종합 능력치가 패자보다 일정 격차 이상 낮으면 이변으로 판정한다. */
export function isUpset(winnerTeamId: string, loserTeamId: string): boolean {
  const winnerOverall = getRatings(winnerTeamId).overall
  const loserOverall = getRatings(loserTeamId).overall
  return loserOverall - winnerOverall >= UPSET_RATING_GAP
}

export interface MatchUpsetInfo {
  /** 스코어만으로 승자를 가릴 수 없는 경우(무승부) undefined */
  winnerTeamId?: string
  upset: boolean
  /** 무승부인데 두 팀의 능력치 격차가 큰 경우(약팀의 선전) */
  surpriseDraw: boolean
}

export function classifyMatchUpset(
  homeTeamId: string,
  awayTeamId: string,
  homeGoals: number,
  awayGoals: number,
): MatchUpsetInfo {
  if (homeGoals === awayGoals) {
    const gap = Math.abs(getRatings(homeTeamId).overall - getRatings(awayTeamId).overall)
    return { upset: false, surpriseDraw: gap >= UPSET_RATING_GAP }
  }
  const winnerTeamId = homeGoals > awayGoals ? homeTeamId : awayTeamId
  const loserTeamId = winnerTeamId === homeTeamId ? awayTeamId : homeTeamId
  return { winnerTeamId, upset: isUpset(winnerTeamId, loserTeamId), surpriseDraw: false }
}
