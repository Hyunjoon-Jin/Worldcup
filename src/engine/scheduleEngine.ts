import { GROUP_LETTERS } from '../data/hostSlots'
import { dateForGroupStageDay, ROUND_DATE_WINDOWS } from '../data/calendar'
import { ROUND_SLOT_IDS } from '../data/bracketTemplate'
import type { GroupLetter } from '../types/group'
import type { KnockoutRound } from '../types/match'
import type { ScheduledGroupMatch, ScheduledKnockoutMatch, TournamentSchedule } from '../types/schedule'
import { FIXTURE_ROTATION } from './groupFixtureTemplate'

const GROUPS_PER_DAY = 3
const KNOCKOUT_ROUND_ORDER: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL']

/** 하루 안에서의 킥오프 시간대(현지시간). 같은 조의 두 경기는 항상 같은 시간대를 공유한다. */
export const TIME_SLOTS = ['12:00', '15:00', '18:00', '21:00']

function groupBlockDay(group: GroupLetter, matchday: 1 | 2 | 3): number {
  const groupIndex = GROUP_LETTERS.indexOf(group) // 0..11
  const blockOfDay = Math.floor(groupIndex / GROUPS_PER_DAY) // 0..3
  return (matchday - 1) * 4 + blockOfDay + 1 // 1..12
}

/** 조추첨 완료 후 그룹스테이지 36경기를 실제 일정 로테이션(S1-S4/S2-S3 ...)대로 Day·시간대에 배정한다. */
export function buildGroupStageSchedule(): ScheduledGroupMatch[] {
  const matches: ScheduledGroupMatch[] = []
  for (const group of GROUP_LETTERS) {
    const groupIndex = GROUP_LETTERS.indexOf(group)
    const timeSlot = TIME_SLOTS[groupIndex % GROUPS_PER_DAY]
    for (const fixture of FIXTURE_ROTATION) {
      const day = groupBlockDay(group, fixture.matchday)
      matches.push({
        id: `${group}-MD${fixture.matchday}-${fixture.homeSeed}v${fixture.awaySeed}`,
        kind: 'group',
        group,
        matchday: fixture.matchday,
        homeSeed: fixture.homeSeed,
        awaySeed: fixture.awaySeed,
        day,
        date: dateForGroupStageDay(day),
        timeSlot,
      })
    }
  }
  return matches.sort((a, b) => a.day - b.day)
}

/** 그룹스테이지 종료 후 32강부터의 라운드별 날짜창에 경기를 균등 배분하고 시간대를 부여한다. */
export function buildKnockoutSchedule(): ScheduledKnockoutMatch[] {
  const matches: ScheduledKnockoutMatch[] = []
  for (const round of KNOCKOUT_ROUND_ORDER) {
    const window = ROUND_DATE_WINDOWS[round]
    const start = new Date(window.start + 'T00:00:00Z')
    const end = new Date(window.end + 'T00:00:00Z')
    const daySpan = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    const slotIds = ROUND_SLOT_IDS[round]
    const countPerDate: Record<string, number> = {}
    for (let i = 0; i < slotIds.length; i++) {
      const dayOffset = Math.floor((i * daySpan) / slotIds.length)
      const date = new Date(start.getTime() + dayOffset * 86400000).toISOString().slice(0, 10)
      const indexInDate = countPerDate[date] ?? 0
      countPerDate[date] = indexInDate + 1
      matches.push({
        id: slotIds[i],
        kind: 'knockout',
        round,
        slotId: slotIds[i],
        date,
        timeSlot: TIME_SLOTS[indexInDate % TIME_SLOTS.length],
      })
    }
  }
  return matches
}

export function buildFullSchedule(): TournamentSchedule {
  const groupMatches = buildGroupStageSchedule()
  return {
    groupMatches,
    knockoutMatches: buildKnockoutSchedule(),
    totalGroupStageDays: Math.max(...groupMatches.map((m) => m.day)),
  }
}
