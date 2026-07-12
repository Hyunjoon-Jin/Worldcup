import { TEAMS_BY_ID } from '../data/teams'
import { useConditionStore } from '../store/useConditionStore'
import { useMomentumStore } from '../store/useMomentumStore'
import { useSandboxStore } from '../store/useSandboxStore'
import type { TeamRatings } from '../types/team'
import {
  EXPECTED_GOALS,
  FORECAST_GOAL_CAP,
  PENALTY,
  UPSET_RATING_GAP,
  clamp,
  hostAdvantageFor,
} from './config'

/**
 * 이번 대회의 팀별 컨디션(useConditionStore)과 진행 중 모멘텀(useMomentumStore, C4)을 폼 능력치에
 * 반영한 뒤, 샌드박스 수동 조정을 최종 적용한다.
 */
export function getRatings(teamId: string): TeamRatings {
  const team = TEAMS_BY_ID[teamId]
  const conditionOffset = useConditionStore.getState().offsets[teamId] ?? 0
  const momentumOffset = useMomentumStore.getState().offsets[teamId] ?? 0
  const conditioned: TeamRatings = {
    ...team.baseRatings,
    form: clamp(team.baseRatings.form + conditionOffset + momentumOffset, 30, 99),
  }
  const override = useSandboxStore.getState().overrides[teamId]
  return override ? { ...conditioned, ...override } : conditioned
}

// 실제 축구 경기의 평균 득점(팀당 약 1.3골)에 가깝게 보정하고, 극단적인 능력치 차이에서도
// 대량 득점 블로아웃이 지나치게 자주 나오지 않도록 민감도를 낮추고 상하한을 좁혔다.
// hostAdvantage는 개최국 홈 경기일 때만 양수(팀별 세분화, C2).
function expectedGoals(attacker: TeamRatings, defender: TeamRatings, hostAdvantage: number): number {
  const strengthDiff =
    attacker.attack -
    defender.defense +
    (attacker.form - EXPECTED_GOALS.formBaseline) * EXPECTED_GOALS.formWeight +
    hostAdvantage
  return clamp(EXPECTED_GOALS.base + strengthDiff / EXPECTED_GOALS.divisor, EXPECTED_GOALS.min, EXPECTED_GOALS.max)
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

function poissonPmf(lambda: number, k: number): number {
  let factorial = 1
  for (let i = 2; i <= k; i++) factorial *= i
  return (Math.exp(-lambda) * lambda ** k) / factorial
}

export interface MatchForecast {
  homeWinPct: number
  drawPct: number
  awayWinPct: number
}

/**
 * 실제 무작위 표본추출 없이, simulateMatch와 동일한 득점 기대값(포아송 분포)을 정확한
 * 확률 분포 합산으로 계산해 경기 전 승/무/패 예상 확률을 구한다(경기 결과 자체는 그대로
 * 무작위지만, "경기 전 예상"은 매번 같은 값이 나와야 하므로 시뮬레이션이 아닌 해석적 계산을
 * 쓴다).
 */
export function forecastMatch(homeTeamId: string, awayTeamId: string): MatchForecast {
  const home = getRatings(homeTeamId)
  const away = getRatings(awayTeamId)
  const homeHostAdv = TEAMS_BY_ID[homeTeamId].isHost ? hostAdvantageFor(homeTeamId) : 0
  const awayHostAdv = TEAMS_BY_ID[awayTeamId].isHost ? hostAdvantageFor(awayTeamId) : 0
  const homeLambda = expectedGoals(home, away, homeHostAdv)
  const awayLambda = expectedGoals(away, home, awayHostAdv)

  let homeWin = 0
  let draw = 0
  let awayWin = 0
  for (let h = 0; h <= FORECAST_GOAL_CAP; h++) {
    for (let a = 0; a <= FORECAST_GOAL_CAP; a++) {
      const p = poissonPmf(homeLambda, h) * poissonPmf(awayLambda, a)
      if (h > a) homeWin += p
      else if (h === a) draw += p
      else awayWin += p
    }
  }
  const total = homeWin + draw + awayWin
  return { homeWinPct: (homeWin / total) * 100, drawPct: (draw / total) * 100, awayWinPct: (awayWin / total) * 100 }
}

export interface SimulatedScore {
  homeGoals: number
  awayGoals: number
}

export function simulateMatch(homeTeamId: string, awayTeamId: string): SimulatedScore {
  const home = getRatings(homeTeamId)
  const away = getRatings(awayTeamId)
  const homeHostAdv = TEAMS_BY_ID[homeTeamId].isHost ? hostAdvantageFor(homeTeamId) : 0
  const awayHostAdv = TEAMS_BY_ID[awayTeamId].isHost ? hostAdvantageFor(awayTeamId) : 0

  const homeLambda = expectedGoals(home, away, homeHostAdv)
  const awayLambda = expectedGoals(away, home, awayHostAdv)

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
  const homeStrength = home.overall + home.form * PENALTY.formFactor + PENALTY.baseline
  const awayStrength = away.overall + away.form * PENALTY.formFactor + PENALTY.baseline
  const rawProb = homeStrength / (homeStrength + awayStrength)
  // 실력차의 영향을 줄여 50:50에 가깝게 — 승부차기의 높은 변동성 반영 (C3)
  const homeWinProb = 0.5 + (rawProb - 0.5) * PENALTY.dampen

  return {
    homeGoals,
    awayGoals,
    wentToPenalties: true,
    winnerTeamId: Math.random() < homeWinProb ? homeTeamId : awayTeamId,
  }
}

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
