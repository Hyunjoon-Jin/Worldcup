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

/**
 * 조별 경기 킥오프 시간대 (C22·C23).
 * - MD1·MD2: 한 조의 두 경기를 시차 배정(다른 시간대)해 관중이 순차 관전하게 하고, 조의 하루 내
 *   위치(dayPos)와 경기 순번(fixtureIdx)으로 12:00~21:00 4개 슬롯을 모두 활용한다.
 * - MD3(최종전): 담합 방지를 위해 조 내 두 경기를 반드시 동시에(같은 시간대) 연다.
 */
function groupTimeSlot(dayPos: number, matchday: 1 | 2 | 3, fixtureIdx: number): string {
  if (matchday === 3) return TIME_SLOTS[dayPos % TIME_SLOTS.length]
  return TIME_SLOTS[(dayPos + fixtureIdx) % TIME_SLOTS.length]
}

/** 조추첨 완료 후 그룹스테이지 72경기를 실제 일정 로테이션(S1-S4/S2-S3 ...)대로 Day·시간대에 배정한다. */
export function buildGroupStageSchedule(): ScheduledGroupMatch[] {
  const matches: ScheduledGroupMatch[] = []
  for (const group of GROUP_LETTERS) {
    const groupIndex = GROUP_LETTERS.indexOf(group)
    const dayPos = groupIndex % GROUPS_PER_DAY // 하루 안에서 이 조의 위치(0..2)
    const fixtureIdxByMd: Record<number, number> = {} // 매치데이별 경기 순번(0,1)
    for (const fixture of FIXTURE_ROTATION) {
      const fixtureIdx = fixtureIdxByMd[fixture.matchday] ?? 0
      fixtureIdxByMd[fixture.matchday] = fixtureIdx + 1
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
        timeSlot: groupTimeSlot(dayPos, fixture.matchday, fixtureIdx),
      })
    }
  }
  return matches.sort((a, b) => a.day - b.day)
}

/** 그룹스테이지 종료 후 32강부터의 라운드별 날짜창에 경기를 균등 배분하고 시간대를 부여한다. */
export function buildKnockoutSchedule(): ScheduledKnockoutMatch[] {
  const matches: ScheduledKnockoutMatch[] = []
  // 날짜별로 이미 배정된 시간대를 라운드 경계를 넘어 전역 추적한다(C24). 결승·3·4위전이 한 날짜에
  // 겹치더라도 같은 시간대에 중복 편성되지 않도록, 그 날짜의 빈 시간대를 우선 배정한다.
  const usedSlotsByDate: Record<string, Set<string>> = {}
  const assignSlot = (date: string): string => {
    const used = usedSlotsByDate[date] ?? (usedSlotsByDate[date] = new Set())
    const free = TIME_SLOTS.find((s) => !used.has(s)) ?? TIME_SLOTS[used.size % TIME_SLOTS.length]
    used.add(free)
    return free
  }
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
        timeSlot: assignSlot(date),
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
