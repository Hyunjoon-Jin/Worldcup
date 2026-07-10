import type { GroupLetter } from './group'
import type { KnockoutRound } from './match'

export interface ScheduledGroupMatch {
  id: string
  kind: 'group'
  group: GroupLetter
  matchday: 1 | 2 | 3
  /** 조추첨으로 확정된 조 내 시드 포지션(1=포트1 ... 4=포트4) */
  homeSeed: 1 | 2 | 3 | 4
  awaySeed: 1 | 2 | 3 | 4
  day: number
  date: string
}

export interface ScheduledKnockoutMatch {
  id: string
  kind: 'knockout'
  round: KnockoutRound
  slotId: string
  date: string
}

export type ScheduledMatch = ScheduledGroupMatch | ScheduledKnockoutMatch

export interface TournamentSchedule {
  groupMatches: ScheduledGroupMatch[]
  knockoutMatches: ScheduledKnockoutMatch[]
  totalGroupStageDays: number
}
