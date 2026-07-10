import { GROUP_LETTERS } from '../data/hostSlots'
import {
  FINAL_SLOT_ID,
  QF_SLOT_IDS,
  R16_SLOT_IDS,
  R32_SLOTS,
  SF_SLOT_IDS,
  THIRD_SLOT_ID,
  WT_SLOT_GROUPS,
} from '../data/bracketTemplate'
import type { GroupLetter } from '../types/group'
import type { GroupMatch, KnockoutMatch, KnockoutRound } from '../types/match'
import { rankGroupTeams, rankThirdPlaceTeams } from './tiebreakers'

export interface GroupResult {
  winner: string
  runnerup: string
  third: string
  fourth: string
}

export function computeGroupResults(
  groupTeams: Record<GroupLetter, string[]>,
  matches: GroupMatch[],
): Record<GroupLetter, GroupResult> {
  const result = {} as Record<GroupLetter, GroupResult>
  for (const group of GROUP_LETTERS) {
    const groupMatches = matches.filter((m) => m.group === group)
    const order = rankGroupTeams(groupTeams[group], groupMatches)
    result[group] = { winner: order[0], runnerup: order[1], third: order[2], fourth: order[3] }
  }
  return result
}

export function computeQualifiedThirdGroups(
  groupResults: Record<GroupLetter, GroupResult>,
  matches: GroupMatch[],
): GroupLetter[] {
  const thirdByGroup = Object.fromEntries(GROUP_LETTERS.map((g) => [g, groupResults[g].third])) as Record<
    GroupLetter,
    string
  >
  const ranked = rankThirdPlaceTeams(thirdByGroup, matches)
  return ranked.filter((e) => e.qualified).map((e) => e.group)
}

export interface BracketMatchup {
  slotId: string
  team1Id: string
  team2Id: string
}

/** 자기 조 재대결을 피하면서 진출한 8개 3위팀을 8개 WT 슬롯에 결정적으로 배정한다. */
function assignThirdsToSlots(qualifiedThirdGroups: GroupLetter[]): GroupLetter[] {
  const sortedThirdGroups = [...qualifiedThirdGroups].sort()
  const assignment = [...sortedThirdGroups]
  for (let iter = 0; iter < assignment.length * 2; iter++) {
    const conflictIndex = assignment.findIndex((g, i) => g === WT_SLOT_GROUPS[i])
    if (conflictIndex === -1) break
    const swapWith = (conflictIndex + 1) % assignment.length
    ;[assignment[conflictIndex], assignment[swapWith]] = [assignment[swapWith], assignment[conflictIndex]]
  }
  return assignment
}

export function buildR32Matchups(
  groupResults: Record<GroupLetter, GroupResult>,
  qualifiedThirdGroups: GroupLetter[],
): BracketMatchup[] {
  const thirdAssignment = assignThirdsToSlots(qualifiedThirdGroups)
  let wtIndex = 0

  return R32_SLOTS.map((slot) => {
    const resolveRef = (ref: (typeof slot)['team1']): string => {
      if (ref.type === 'winner') return groupResults[ref.group].winner
      if (ref.type === 'runnerup') return groupResults[ref.group].runnerup
      const thirdGroup = thirdAssignment[wtIndex]
      wtIndex += 1
      return groupResults[thirdGroup].third
    }
    return { slotId: slot.id, team1Id: resolveRef(slot.team1), team2Id: resolveRef(slot.team2) }
  })
}

export interface KnockoutSlotState {
  slotId: string
  round: KnockoutRound
  team1Id: string | null
  team2Id: string | null
  result: KnockoutMatch | null
}

function loserOf(match: KnockoutMatch): string {
  return match.winnerTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
}

interface RoundLink {
  fromIds: string[]
  toIds: string[]
  extract: (match: KnockoutMatch) => string
}

// 각 링크는 "이전 라운드 슬롯 2개 → 다음 라운드(또는 3·4위전) 슬롯 1개"의 인접 페어링이다.
// 두 소스 슬롯이 동시에 끝나야만 다음 슬롯을 채우는 것이 아니라, 한쪽 경기가 끝나는 즉시
// 그 팀만 먼저 올려보내고(팀1/팀2를 독립적으로 채움) 나머지는 TBD로 남겨, "경기 직후 바로
// 다음 라운드 대진에 반영"되도록 한다.
const ROUND_LINKS: RoundLink[] = [
  { fromIds: R32_SLOTS.map((s) => s.id), toIds: R16_SLOT_IDS, extract: (m) => m.winnerTeamId },
  { fromIds: R16_SLOT_IDS, toIds: QF_SLOT_IDS, extract: (m) => m.winnerTeamId },
  { fromIds: QF_SLOT_IDS, toIds: SF_SLOT_IDS, extract: (m) => m.winnerTeamId },
  { fromIds: SF_SLOT_IDS, toIds: [FINAL_SLOT_ID], extract: (m) => m.winnerTeamId },
  { fromIds: SF_SLOT_IDS, toIds: [THIRD_SLOT_ID], extract: loserOf },
]

/** 이전 라운드 경기가 끝나는 즉시(둘 다 끝날 때까지 기다리지 않고) 다음 라운드 슬롯에 팀을 채운다. */
export function progressBracket(slots: Record<string, KnockoutSlotState>): Record<string, KnockoutSlotState> {
  const next = { ...slots }

  for (const link of ROUND_LINKS) {
    const pairSize = link.fromIds.length / link.toIds.length
    for (let i = 0; i < link.toIds.length; i++) {
      const targetId = link.toIds[i]
      const source0 = next[link.fromIds[i * pairSize]]
      const source1 = next[link.fromIds[i * pairSize + 1]]
      let target = next[targetId]
      if (!target.team1Id && source0?.result) target = { ...target, team1Id: link.extract(source0.result) }
      if (!target.team2Id && source1?.result) target = { ...target, team2Id: link.extract(source1.result) }
      if (target !== next[targetId]) next[targetId] = target
    }
  }

  return next
}
