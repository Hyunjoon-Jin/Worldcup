/**
 * 시뮬레이션 밸런싱 상수 중앙 관리 (F4).
 *
 * 기존에 matchEngine·teams·conditionStore 등에 흩어져 있던 매직넘버를 한곳에 모아
 * 밸런스 조정과 실험을 쉽게 한다. 값의 의미는 각 상수 주석 참고.
 */

/** 개최국(미국·멕시코·캐나다) 홈 경기 시 기대 득점에 더해지는 이점. */
export const HOST_ADVANTAGE = 5

/** 기대 득점 산출식 파라미터: baseGoals + strengthDiff / divisor, [min, max]로 클램프. */
export const EXPECTED_GOALS = {
  base: 1.25,
  divisor: 38,
  /** 폼(컨디션)이 기대 득점에 기여하는 가중치. */
  formWeight: 0.15,
  /** 폼의 기준선(이 값보다 높으면 가점, 낮으면 감점). */
  formBaseline: 70,
  min: 0.35,
  max: 3.1,
} as const

/** 경기 전 승/무/패 예상 확률을 해석적으로 계산할 때 합산할 최대 골 수. */
export const FORECAST_GOAL_CAP = 8

/** 승자의 종합 능력치가 패자보다 이 값 이상 낮으면 이변으로 판정한다. */
export const UPSET_RATING_GAP = 8

/** 승부차기 승률 산출식: overall + form * formFactor + baseline 강도비. */
export const PENALTY = {
  formFactor: 0.2,
  baseline: 50,
} as const

/** 대회(조추첨)마다 팀별 컨디션이 이 범위 안에서 무작위로 오르내린다(폼 능력치에 가감). */
export const CONDITION_RANGE = 8

/** 랭킹 → 능력치 변환 파라미터(teams.ts). */
export const RATINGS_FROM_RANK = {
  /** rank 1 → ~97, 이후 랭킹 1위 하락마다 감소하는 기울기. */
  overallTop: 97,
  overallSlope: 1.05,
  overallFloor: 46,
  overallCap: 97,
  /** styleBias가 공격/수비 배분에 곱해지는 계수. */
  styleFactor: 1.4,
  attackFloor: 35,
  attackCap: 99,
  formFloor: 40,
  formCap: 99,
} as const

/** 몬테카를로 반복 횟수 프리셋 (B2). */
export const ITERATION_PRESETS = {
  fast: 500,
  standard: 1500,
  precise: 4000,
} as const

export type IterationPreset = keyof typeof ITERATION_PRESETS

/** 팀 시나리오/상대 예측 등 보조 시뮬레이션의 기본 반복 횟수. */
export const SCENARIO_ITERATIONS = 500
export const OPPONENT_FORECAST_ITERATIONS = 500

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
