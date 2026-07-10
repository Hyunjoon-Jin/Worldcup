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
  isHost: boolean
  baseRatings: TeamRatings
}
