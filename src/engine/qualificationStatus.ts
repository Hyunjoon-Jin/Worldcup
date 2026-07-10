import { GROUP_LETTERS } from '../data/hostSlots'
import { TEAMS_BY_ID } from '../data/teams'
import { computeStandings, rankGroupTeams } from './tiebreakers'
import type { GroupLetter, GroupStanding } from '../types/group'
import type { GroupMatch } from '../types/match'

export type QualificationStatus = 'advancing' | 'eliminated' | 'undecided'

const MATCHES_PER_TEAM = 3
const THIRD_PLACE_SLOTS = 8

/** 서로 다른 조의 3위팀을 횡단 비교할 때는 상호전적이 성립하지 않으므로 조 전체 기록만 비교한다. */
function thirdPlaceComparator(a: GroupStanding, b: GroupStanding): number {
  if (b.points !== a.points) return b.points - a.points
  const gdA = a.goalsFor - a.goalsAgainst
  const gdB = b.goalsFor - b.goalsAgainst
  if (gdB !== gdA) return gdB - gdA
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
  return TEAMS_BY_ID[a.teamId].fifaRankApprox - TEAMS_BY_ID[b.teamId].fifaRankApprox
}

function maxPossiblePoints(s: GroupStanding): number {
  return s.points + 3 * (MATCHES_PER_TEAM - s.played)
}

/**
 * 상대팀 r이 여전히 나(s)의 현재 순위를 뒤집을 수 있는 "진짜 위협"인지 판정한다.
 * 승점 상한이 같더라도, 두 팀 모두 경기가 이미 끝났다면 그 동률은 상호전적/골득실로
 * 영구히 확정된 것이므로(더 이상 바뀔 수 없음), 이미 나보다 뒤에 있는 팀은 위협이 아니다.
 */
function isRealThreat(
  s: GroupStanding,
  r: GroupStanding,
  myOrderIndex: number,
  rivalOrderIndex: number,
): boolean {
  const rMax = maxPossiblePoints(r)
  if (rMax < s.points) return false
  if (rMax > s.points) return true
  const bothDone = s.played >= MATCHES_PER_TEAM && r.played >= MATCHES_PER_TEAM
  if (!bothDone) return true
  // 승점 상한이 같고 둘 다 경기가 끝났다면, 이미 계산된 순위(상호전적 포함)가 곧 최종 결과다.
  return rivalOrderIndex < myOrderIndex
}

/**
 * 현재까지의 경기 결과만으로 각 팀의 32강 진출 확정/탈락 여부를 판정한다. 판정은 항상
 * "과대 확정이 없는" 보수적 방향으로 이루어진다(애매하면 확정 대신 진행중으로 남긴다).
 *
 * - 진출 확정: (a) 자기 조 1·2위를 보장받거나(이미 결판난 동률은 위협으로 세지 않음), (b) 자기 조
 *   일정이 끝나 3위가 확정된 상태에서, 다른 11개 조 중 아직 이 팀을 앞지를 "가능성이 있는" 조가
 *   7개 이하인 경우(즉 최악의 경우에도 3위 진출 8자리 안에 든다).
 * - 탈락 확정: (a) 자기 조 1·2위 진출이 수학적으로 불가능하고, (b) 자기 조 일정이 모두 끝났으며,
 *   (c-1) 자기 조 3위가 아니거나(4위 확정), (c-2) 3위이더라도 이미 일정이 끝난 다른 조의 3위팀
 *   중 이 팀보다 앞서는 팀이 8개 이상이라 3위 진출 경로도 막힌 경우.
 */
export function computeQualificationStatuses(
  groupTeams: Record<GroupLetter, string[]>,
  matches: GroupMatch[],
): Record<string, QualificationStatus> {
  const statuses: Record<string, QualificationStatus> = {}
  const perGroupInfo: Record<
    GroupLetter,
    { standings: Record<string, GroupStanding>; finished: boolean; order: string[]; thirdTeamId: string }
  > = {} as never

  for (const group of GROUP_LETTERS) {
    const teamIds = groupTeams[group]
    if (!teamIds || teamIds.length < 4) continue
    const groupMatches = matches.filter((m) => m.group === group)
    const standings = computeStandings(teamIds, groupMatches)
    const finished = groupMatches.length >= 6
    // 조 내 순위(3위 포함)는 상호전적을 우선하는 공식 타이브레이커 규정을 그대로 따른다.
    const order = rankGroupTeams(teamIds, groupMatches)
    perGroupInfo[group] = { standings, finished, order, thirdTeamId: order[2] }
  }

  const groups = Object.keys(perGroupInfo) as GroupLetter[]
  const finishedThirds = groups
    .filter((g) => perGroupInfo[g].finished)
    .map((g) => perGroupInfo[g].standings[perGroupInfo[g].thirdTeamId])

  for (const group of groups) {
    const info = perGroupInfo[group]
    const teamIds = groupTeams[group]

    for (const teamId of teamIds) {
      const s = info.standings[teamId]
      const myOrderIndex = info.order.indexOf(teamId)
      const rivals = teamIds.filter((id) => id !== teamId)

      // 1) 자기 조 1·2위 확정(이미 끝난 동률은 위협에서 제외)
      const threats = rivals.filter((rid) =>
        isRealThreat(s, info.standings[rid], myOrderIndex, info.order.indexOf(rid)),
      ).length
      if (threats <= 1) {
        statuses[teamId] = 'advancing'
        continue
      }

      if (!info.finished) {
        statuses[teamId] = 'undecided'
        continue
      }

      // 2) 자기 조가 끝났고 1·2위가 아님 — 3위가 아니면(=4위) 3위 진출 경로 자체가 없어 탈락 확정
      if (teamId !== info.thirdTeamId) {
        statuses[teamId] = 'eliminated'
        continue
      }

      // 3) 3위 확정 — 다른 11개 조 중 이미 끝난 조의 3위가 나를 앞서면 확실한 위협,
      //    아직 안 끝난 조는 결과를 알 수 없으므로 안전하게 위협으로 간주한다.
      const otherGroups = groups.filter((g) => g !== group)
      const possibleThreats = otherGroups.filter((g) => {
        const other = perGroupInfo[g]
        if (!other.finished) return true
        return thirdPlaceComparator(other.standings[other.thirdTeamId], s) <= 0
      }).length

      if (possibleThreats <= THIRD_PLACE_SLOTS - 1) {
        statuses[teamId] = 'advancing'
        continue
      }

      const outranking = finishedThirds.filter((t) => t.teamId !== teamId && thirdPlaceComparator(t, s) < 0).length
      statuses[teamId] = outranking >= THIRD_PLACE_SLOTS ? 'eliminated' : 'undecided'
    }
  }

  return statuses
}

/**
 * 조별 순위 1~4위 각각이 "더 이상 절대 바뀔 수 없는" 상태인지(정확한 순위 확정 여부) 계산한다.
 * 32강 대진표에서 특정 슬롯(조 1위/2위)의 실제 진출 팀이 확정되었는지 표시할 때 사용한다.
 * 반환값은 현재 순위(rankGroupTeams 결과) 순서를 그대로 따르는 boolean 배열이다.
 */
export function computeExactRankLocks(teamIds: string[], matches: GroupMatch[]): boolean[] {
  const standings = computeStandings(teamIds, matches)
  const order = rankGroupTeams(teamIds, matches)
  const finished = matches.length >= 6
  if (finished) return order.map(() => true)

  return order.map((teamId, idx) => {
    const s = standings[teamId]
    return order.every((rivalId, rivalIdx) => {
      if (rivalId === teamId) return true
      if (rivalIdx > idx) return !isRealThreat(s, standings[rivalId], idx, rivalIdx)
      return !isRealThreat(standings[rivalId], s, rivalIdx, idx)
    })
  })
}
