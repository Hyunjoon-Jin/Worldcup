import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../data/nations'
import { EXPECTED_GOALS, PENALTY, clamp, hostAdvantageFor } from './config'
import type { TeamRatings } from '../types/team'

/**
 * 순수 경기 시뮬레이션 코어 (v2 #42 / H1). store를 읽지 않고 능력치(TeamRatings)와 난수 함수만
 * 입력받는다. 덕분에 Web Worker 등 store가 없는 환경에서도 동일한 시뮬레이션을 돌릴 수 있다.
 * matchEngine(메인스레드)과 simCore(워커)가 모두 이 코어를 공유해 로직 중복을 없앤다.
 */

export type RandomFn = () => number

/** 개최국 홈 경기일 때만 팀별 홈 이점, 아니면 0 (정적 데이터 기반). */
export function hostAdvFor(teamId: string): number {
  return TEAMS_BY_ID[teamId].isHost ? hostAdvantageFor(teamId) : 0
}

export function expectedGoals(attacker: TeamRatings, defender: TeamRatings, hostAdvantage: number): number {
  const strengthDiff =
    attacker.attack -
    defender.defense +
    (attacker.form - EXPECTED_GOALS.formBaseline) * EXPECTED_GOALS.formWeight +
    hostAdvantage
  return clamp(EXPECTED_GOALS.base + strengthDiff / EXPECTED_GOALS.divisor, EXPECTED_GOALS.min, EXPECTED_GOALS.max)
}

export function samplePoisson(lambda: number, rand: RandomFn): number {
  const limit = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k += 1
    p *= rand()
  } while (p > limit)
  return k - 1
}

export function poissonPmf(lambda: number, k: number): number {
  let factorial = 1
  for (let i = 2; i <= k; i++) factorial *= i
  return (Math.exp(-lambda) * lambda ** k) / factorial
}

export interface SimScore {
  homeGoals: number
  awayGoals: number
}

/** 홈 이점을 명시적으로 받는 순수 득점 시뮬(팀 ID 조회 없음 — 예선 등 임의 팀에 안전). */
export function simulateScoreRaw(
  homeR: TeamRatings,
  awayR: TeamRatings,
  homeHostAdv: number,
  awayHostAdv: number,
  rand: RandomFn,
): SimScore {
  const homeLambda = expectedGoals(homeR, awayR, homeHostAdv)
  const awayLambda = expectedGoals(awayR, homeR, awayHostAdv)
  return { homeGoals: samplePoisson(homeLambda, rand), awayGoals: samplePoisson(awayLambda, rand) }
}

export function simulateScore(
  homeId: string,
  homeR: TeamRatings,
  awayId: string,
  awayR: TeamRatings,
  rand: RandomFn,
): SimScore {
  return simulateScoreRaw(homeR, awayR, hostAdvFor(homeId), hostAdvFor(awayId), rand)
}

export interface SimKnockout extends SimScore {
  wentToPenalties: boolean
  winnerTeamId: string
}

/** 홈 이점을 명시적으로 받는 순수 녹아웃 시뮬(팀 ID 조회 없음 — 예선/PO 등 임의 팀에 안전). */
export function simulateKnockoutRaw(
  homeId: string,
  homeR: TeamRatings,
  awayId: string,
  awayR: TeamRatings,
  homeHostAdv: number,
  awayHostAdv: number,
  rand: RandomFn,
): SimKnockout {
  const { homeGoals, awayGoals } = simulateScoreRaw(homeR, awayR, homeHostAdv, awayHostAdv, rand)
  if (homeGoals !== awayGoals) {
    return { homeGoals, awayGoals, wentToPenalties: false, winnerTeamId: homeGoals > awayGoals ? homeId : awayId }
  }
  const homeStrength = homeR.overall + homeR.form * PENALTY.formFactor + PENALTY.baseline
  const awayStrength = awayR.overall + awayR.form * PENALTY.formFactor + PENALTY.baseline
  const rawProb = homeStrength / (homeStrength + awayStrength)
  // 실력차의 영향을 줄여 50:50에 가깝게 — 승부차기의 높은 변동성 반영 (C3)
  const homeWinProb = 0.5 + (rawProb - 0.5) * PENALTY.dampen
  return { homeGoals, awayGoals, wentToPenalties: true, winnerTeamId: rand() < homeWinProb ? homeId : awayId }
}

export function simulateKnockout(
  homeId: string,
  homeR: TeamRatings,
  awayId: string,
  awayR: TeamRatings,
  rand: RandomFn,
): SimKnockout {
  return simulateKnockoutRaw(homeId, homeR, awayId, awayR, hostAdvFor(homeId), hostAdvFor(awayId), rand)
}
