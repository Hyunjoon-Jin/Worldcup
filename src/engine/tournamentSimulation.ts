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

/** 이전 라운드 슬롯(승자 배열, 순서 유지)을 인접 2개씩 묶어 다음 라운드 대진을 만든다. */
export function pairNextRound(prevWinners: string[], nextSlotIds: string[]): BracketMatchup[] {
  return nextSlotIds.map((slotId, i) => ({
    slotId,
    team1Id: prevWinners[i * 2],
    team2Id: prevWinners[i * 2 + 1],
  }))
}

export interface KnockoutSlotState {
  slotId: string
  round: KnockoutRound
  team1Id: string | null
  team2Id: string | null
  result: KnockoutMatch | null
}

const ROUND_PROGRESSION: { from: KnockoutRound; fromIds: string[]; to: KnockoutRound; toIds: string[] }[] = [
  { from: 'R32', fromIds: R32_SLOTS.map((s) => s.id), to: 'R16', toIds: R16_SLOT_IDS },
  { from: 'R16', fromIds: R16_SLOT_IDS, to: 'QF', toIds: QF_SLOT_IDS },
  { from: 'QF', fromIds: QF_SLOT_IDS, to: 'SF', toIds: SF_SLOT_IDS },
]

function loserOf(match: KnockoutMatch): string {
  return match.winnerTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
}

/** 라운드가 모두 끝났으면 다음 라운드(및 결승/3·4위전) 대진을 채운다. */
export function progressBracket(slots: Record<string, KnockoutSlotState>): Record<string, KnockoutSlotState> {
  const next = { ...slots }

  for (const { fromIds, toIds } of ROUND_PROGRESSION) {
    const targetsAlreadySet = toIds.every((id) => next[id]?.team1Id)
    if (targetsAlreadySet) continue
    const allDone = fromIds.every((id) => next[id]?.result)
    if (!allDone) continue
    const winners = fromIds.map((id) => next[id].result!.winnerTeamId)
    const pairs = pairNextRound(winners, toIds)
    for (const pair of pairs) {
      next[pair.slotId] = { ...next[pair.slotId], team1Id: pair.team1Id, team2Id: pair.team2Id }
    }
  }

  const sfDone = SF_SLOT_IDS.every((id) => next[id]?.result)
  if (sfDone && !next[FINAL_SLOT_ID]?.team1Id) {
    const winners = SF_SLOT_IDS.map((id) => next[id].result!.winnerTeamId)
    next[FINAL_SLOT_ID] = { ...next[FINAL_SLOT_ID], team1Id: winners[0], team2Id: winners[1] }
    const losers = SF_SLOT_IDS.map((id) => loserOf(next[id].result!))
    next[THIRD_SLOT_ID] = { ...next[THIRD_SLOT_ID], team1Id: losers[0], team2Id: losers[1] }
  }

  return next
}
