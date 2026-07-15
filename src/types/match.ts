import type { GroupLetter } from './group'

export interface MatchResult {
  homeTeamId: string
  awayTeamId: string
  homeGoals: number
  awayGoals: number
}

export interface GroupMatch extends MatchResult {
  group: GroupLetter
  matchday: 1 | 2 | 3
}

export type KnockoutRound = 'R32' | 'R16' | 'QF' | 'SF' | 'THIRD' | 'FINAL'

export interface KnockoutMatch extends MatchResult {
  round: KnockoutRound
  slotId: string
  wentToPenalties: boolean
  winnerTeamId: string
  /** 승부차기 성공 개수(승부차기까지 간 경우만). */
  homePenalties?: number
  awayPenalties?: number
}
