import { GROUP_LETTERS } from '../data/hostSlots'
import { dateForGroupStageDay, ROUND_DATE_WINDOWS } from '../data/calendar'
import { ROUND_SLOT_IDS } from '../data/bracketTemplate'
import type { GroupLetter } from '../types/group'
import type { KnockoutRound } from '../types/match'
import type { ScheduledGroupMatch, ScheduledKnockoutMatch, TournamentSchedule } from '../types/schedule'
import { FIXTURE_ROTATION } from './groupFixtureTemplate'

const GROUPS_PER_DAY = 3
const KNOCKOUT_ROUND_ORDER: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL']

function groupBlockDay(group: GroupLetter, matchday: 1 | 2 | 3): number {
  const groupIndex = GROUP_LETTERS.indexOf(group) // 0..11
  const blockOfDay = Math.floor(groupIndex / GROUPS_PER_DAY) // 0..3
  return (matchday - 1) * 4 + blockOfDay + 1 // 1..12
}

/** 조추첨 완료 후 그룹스테이지 36경기를 실제 일정 로테이션(S1-S4/S2-S3 ...)대로 Day에 배정한다. */
export function buildGroupStageSchedule(): ScheduledGroupMatch[] {
  const matches: ScheduledGroupMatch[] = []
  for (const group of GROUP_LETTERS) {
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
      })
    }
  }
  return matches.sort((a, b) => a.day - b.day)
}

/** 그룹스테이지 종료 후 32강부터의 라운드별 날짜창에 경기를 균등 배분한다. */
export function buildKnockoutSchedule(): ScheduledKnockoutMatch[] {
  const matches: ScheduledKnockoutMatch[] = []
  for (const round of KNOCKOUT_ROUND_ORDER) {
    const window = ROUND_DATE_WINDOWS[round]
    const start = new Date(window.start + 'T00:00:00Z')
    const end = new Date(window.end + 'T00:00:00Z')
    const daySpan = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    const slotIds = ROUND_SLOT_IDS[round]
    for (let i = 0; i < slotIds.length; i++) {
      const dayOffset = Math.floor((i * daySpan) / slotIds.length)
      const date = new Date(start.getTime() + dayOffset * 86400000).toISOString().slice(0, 10)
      matches.push({
        id: slotIds[i],
        kind: 'knockout',
        round,
        slotId: slotIds[i],
        date,
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
