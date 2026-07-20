/**
 * 시뮬레이션 밸런싱 상수 중앙 관리 (F4).
 *
 * 기존에 matchEngine·teams·conditionStore 등에 흩어져 있던 매직넘버를 한곳에 모아
 * 밸런스 조정과 실험을 쉽게 한다. 값의 의미는 각 상수 주석 참고.
 */

/** 개최국 홈 경기 시 기대 득점에 더해지는 기본 이점(팀별 값이 없을 때 사용). */
export const HOST_ADVANTAGE = 5

/**
 * 개최국별 홈 이점 세분화 (C2). 실제 관중 규모·이동거리·고지대(멕시코시티) 등을 반영해
 * 개최 3국의 홈 이점을 다르게 준다.
 */
export const HOST_ADVANTAGE_BY_TEAM: Record<string, number> = {
  MEX: 6, // 고지대 + 열광적 홈 관중
  USA: 5, // 대규모 홈 관중
  CAN: 4, // 상대적으로 옅은 홈 이점
}

export function hostAdvantageFor(teamId: string): number {
  return HOST_ADVANTAGE_BY_TEAM[teamId] ?? HOST_ADVANTAGE
}

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

/**
 * 승부차기 승률 산출식: overall + form * formFactor + baseline 강도비 (C3).
 * dampen(<1)으로 능력치 우위의 영향을 줄여 50:50에 가깝게 만든다 — 실제 승부차기는
 * 변동성이 커서 강팀이라도 확실히 유리하지 않다.
 */
export const PENALTY = {
  formFactor: 0.2,
  baseline: 50,
  /** 0..1. 낮을수록 실력차가 승부차기 결과에 덜 반영됨(더 무작위). */
  dampen: 0.55,
} as const

/**
 * 대회 진행 중 최근 성적에 따른 폼 모멘텀 (C4). 최근 window 경기의 승/무/패로 폼을 소폭
 * 가감해 "상승세/하락세" 서사를 만든다. 이미 확정된 경기 결과에만 근거하므로 확률 계산과
 * 실제 경기 시뮬레이션이 일관된 값을 본다.
 */
export const MOMENTUM = {
  window: 3,
  winBonus: 2,
  lossPenalty: 2,
  max: 4,
} as const

/** 대회(조추첨)마다 팀별 컨디션이 이 범위 안에서 무작위로 오르내린다(폼 능력치에 가감). */
export const CONDITION_RANGE = 8

/**
 * 랭킹 → 능력치 변환 파라미터 (C1·G1).
 *
 * 거듭제곱 곡선을 사용한다:
 *   overall = top - span * ((rank-1) / (totalRanks-1)) ^ exponent
 *
 * G1: 예전엔 totalRanks=48이라 rank>55 팀이 전부 floor(48)로 뭉개져, 실제 등록국 206개국 중
 * 하위 ~150개국이 동일 전력이 됐다(마카오·몰디브·괌이 모두 48). 그 결과 강팀이 약팀에 비기거나
 * 지는 비현실적 이변이 잦았고, 현실화한 FIFA 점수 곡선(C)과도 모순됐다. 이제 곡선을 전체 순위
 * (206)에 걸쳐 펼치고 floor를 낮춰 약체를 실제로 약하게 만든다 — rank 100≈59, 150≈47, 206≈35.
 * exponent<1(오목)이라 상위권(1~10위)은 좁게 밀집(편차 ~6)하고, 순위가 내려갈수록 완만히 벌어진다.
 */
export const RATINGS_FROM_RANK = {
  overallTop: 95,
  overallSpan: 60, // rank 206 ≈ 35 (95 − 60)
  overallExponent: 0.72,
  totalRanks: 206,
  // 전체 순위에 곡선을 펼쳤으므로 최하위(rank 206)의 35까지 내려간다. floor는 그 아래로 둬 클리핑을 피한다.
  overallFloor: 33,
  overallCap: 97,
  /** styleBias가 공격/수비 배분에 곱해지는 계수. */
  styleFactor: 1.4,
  attackFloor: 30,
  attackCap: 99,
  formFloor: 40,
  formCap: 99,
} as const

/** 지역예선 홈 경기(홈&어웨이 방식)의 일반 홈 이점. 개최국 특별 이점과 별개(지역예선 Q2). */
export const QUALIFIER_HOME_ADVANTAGE = 6

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
