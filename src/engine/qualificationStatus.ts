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
 * 현재까지의 경기 결과만으로 각 팀의 32강 진출 확정/탈락 여부를 판정한다. 판정은 항상
 * "과대 확정이 없는" 보수적 방향으로 이루어진다(애매하면 확정 대신 진행중으로 남긴다).
 *
 * - 진출 확정: (a) 자기 조 1·2위를 포인트 기준으로 보장받거나, (b) 자기 조 일정이 끝나 3위가
 *   확정된 상태에서, 다른 11개 조 중 아직 이 팀을 앞지를 "가능성이 있는" 조가 7개 이하인 경우
 *   (즉 최악의 경우에도 3위 진출 8자리 안에 든다).
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
    { standings: Record<string, GroupStanding>; finished: boolean; thirdTeamId: string }
  > = {} as never

  for (const group of GROUP_LETTERS) {
    const teamIds = groupTeams[group]
    if (!teamIds || teamIds.length < 4) continue
    const groupMatches = matches.filter((m) => m.group === group)
    const standings = computeStandings(teamIds, groupMatches)
    const finished = groupMatches.length >= 6
    // 조 내 순위(3위 포함)는 상호전적을 우선하는 공식 타이브레이커 규정을 그대로 따른다.
    const order = rankGroupTeams(teamIds, groupMatches)
    perGroupInfo[group] = { standings, finished, thirdTeamId: order[2] }
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
      const rivals = teamIds.filter((id) => id !== teamId).map((id) => info.standings[id])

      // 1) 자기 조 1·2위 확정(포인트 기준 보수적 판정)
      const threats = rivals.filter((r) => maxPossiblePoints(r) >= s.points).length
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
