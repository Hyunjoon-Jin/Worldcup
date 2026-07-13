export type Confederation = 'UEFA' | 'CONMEBOL' | 'AFC' | 'CAF' | 'CONCACAF' | 'OFC'

export type Pot = 1 | 2 | 3 | 4

export interface TeamRatings {
  attack: number
  defense: number
  form: number
  overall: number
}

export interface Team {
  id: string
  nameKo: string
  nameEn: string
  code: string
  /** country-flag-icons react/3x2 component key (ISO2, or GB_ENG/GB_SCT for UK nations) */
  iso2: string
  confederation: Confederation
  pot: Pot
  fifaRankApprox: number
  /** 실측 FIFA 랭킹 포인트(선택, A2). 있으면 랭킹 엔진 시작 점수로 우선 사용하고, 없으면 순위 근사 곡선을 쓴다. */
  fifaPointsApprox?: number
  isHost: boolean
  baseRatings: TeamRatings
}
