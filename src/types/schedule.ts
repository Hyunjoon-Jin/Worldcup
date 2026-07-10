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
  /** 그 날의 킥오프 시간대(현지시간), 같은 조의 두 경기는 항상 같은 시간대에 배정된다 */
  timeSlot: string
}

export interface ScheduledKnockoutMatch {
  id: string
  kind: 'knockout'
  round: KnockoutRound
  slotId: string
  date: string
  timeSlot: string
}

export type ScheduledMatch = ScheduledGroupMatch | ScheduledKnockoutMatch

export interface TournamentSchedule {
  groupMatches: ScheduledGroupMatch[]
  knockoutMatches: ScheduledKnockoutMatch[]
  totalGroupStageDays: number
}
