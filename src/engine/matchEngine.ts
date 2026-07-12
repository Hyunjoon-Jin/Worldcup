import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../data/nations'
import { useConditionStore } from '../store/useConditionStore'
import { useMomentumStore } from '../store/useMomentumStore'
import { useSandboxStore } from '../store/useSandboxStore'
import { usePerformanceStore } from '../store/usePerformanceStore'
import type { TeamRatings } from '../types/team'
import { FORECAST_GOAL_CAP, UPSET_RATING_GAP, clamp } from './config'
import { expectedGoals, hostAdvFor, poissonPmf, simulateKnockout, simulateScore } from './matchCore'

// getRatings는 몬테카를로에서 수백만 번 호출되므로, 입력(컨디션·모멘텀·샌드박스)이 바뀌지 않는
// 동안에는 결과를 캐시해 재계산을 피한다 (B4). 세 store 중 하나라도 바뀌면 버전을 올려 캐시를 비운다.
let ratingsCache: Record<string, TeamRatings> = {}
let cacheVersion = -1
let storeVersion = 0
const bump = () => {
  storeVersion++
}
useConditionStore.subscribe(bump)
useSandboxStore.subscribe(bump)
useMomentumStore.subscribe(bump)
usePerformanceStore.subscribe(bump)

/**
 * 이번 대회의 팀별 컨디션(useConditionStore)·진행 중 모멘텀(useMomentumStore)·성적 반영 보정
 * (usePerformanceStore)을 능력치에 반영한 뒤, 샌드박스 수동 조정을 최종 적용한다.
 * 성적 보정(perfDelta)은 공격·수비·종합에 소폭 더해 "잘 나가는 팀은 능력치가 살짝 오르고
 * 부진하면 살짝 내려가도록" 한다. 결과는 store가 바뀌기 전까지 캐시된다(불변으로 취급).
 */
export function getRatings(teamId: string): TeamRatings {
  if (cacheVersion !== storeVersion) {
    ratingsCache = {}
    cacheVersion = storeVersion
  }
  const cached = ratingsCache[teamId]
  if (cached) return cached

  const team = TEAMS_BY_ID[teamId]
  const base = team.baseRatings
  const conditionOffset = useConditionStore.getState().offsets[teamId] ?? 0
  const momentumOffset = useMomentumStore.getState().offsets[teamId] ?? 0
  const perfDelta = usePerformanceStore.getState().deltas[teamId] ?? 0
  const conditioned: TeamRatings = {
    attack: clamp(base.attack + perfDelta, 1, 99),
    defense: clamp(base.defense + perfDelta, 1, 99),
    overall: clamp(base.overall + perfDelta, 1, 99),
    form: clamp(base.form + conditionOffset + momentumOffset, 30, 99),
  }
  const override = useSandboxStore.getState().overrides[teamId]
  const result = override ? { ...conditioned, ...override } : conditioned
  ratingsCache[teamId] = result
  return result
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
  const homeLambda = expectedGoals(home, away, hostAdvFor(homeTeamId))
  const awayLambda = expectedGoals(away, home, hostAdvFor(awayTeamId))

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
  return simulateScore(homeTeamId, getRatings(homeTeamId), awayTeamId, getRatings(awayTeamId), Math.random)
}

export type SimulatedKnockoutScore = ReturnType<typeof simulateKnockout>

/** 무승부 시 승부차기로 승자를 결정한다(능력치 기반 확률 + 약간의 변수). */
export function simulateKnockoutMatch(homeTeamId: string, awayTeamId: string): SimulatedKnockoutScore {
  return simulateKnockout(homeTeamId, getRatings(homeTeamId), awayTeamId, getRatings(awayTeamId), Math.random)
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
