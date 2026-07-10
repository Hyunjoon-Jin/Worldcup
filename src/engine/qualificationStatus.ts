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
 * 아직 안 끝난 다른 조가 이 팀(승점 ourPoints)의 3위 경쟁에 "이미 확정적으로 앞서는지/뒤처지는지"를
 * 승점만으로 안전하게 판정한다. 승점은 남은 경기로 줄지 않으므로:
 * - 그 조의 현재 승점을 내림차순 정렬했을 때 3번째로 높은 값(= 그 조에서 최종 3위를 차지할 팀의
 *   승점 하한선)이 이미 ourPoints보다 크면, 그 조는 몇 경기가 남았든 상관없이 100% 위협이다
 *   (상위 3개 팀의 승점은 각자 현재값에서 줄어들 수 없으므로, 그중 가장 낮은 값도 결국
 *   ourPoints를 넘는다).
 * - 반대로 그 조에서 "이론상 최대 승점(maxPossiblePoints)이 ourPoints 미만인 팀"이 2팀 이상이면,
 *   최종 3위는 반드시 그 두 팀 중 하나(또는 그보다 나은 팀)가 차지하므로 100% 안전하다.
 * - 둘 다 아니면 아직 확정할 수 없다(진행중으로 남긴다).
 */
function thirdPointsFloor(teamIds: string[], standings: Record<string, GroupStanding>): number {
  const pts = teamIds.map((id) => standings[id].points).sort((a, b) => b - a)
  return pts[2] ?? 0
}

type GroupThreatVerdict = 'ahead' | 'behind' | 'pending'

function classifyGroupThreat(
  other: { standings: Record<string, GroupStanding>; finished: boolean; thirdTeamId: string },
  otherTeamIds: string[],
  ourStanding: GroupStanding,
): GroupThreatVerdict {
  if (other.finished) {
    return thirdPlaceComparator(other.standings[other.thirdTeamId], ourStanding) < 0 ? 'ahead' : 'behind'
  }
  if (thirdPointsFloor(otherTeamIds, other.standings) > ourStanding.points) return 'ahead'
  const guaranteedBelow = otherTeamIds.filter(
    (id) => maxPossiblePoints(other.standings[id]) < ourStanding.points,
  ).length
  if (guaranteedBelow >= 2) return 'behind'
  return 'pending'
}

/**
 * 현재까지의 경기 결과만으로 각 팀의 32강 진출 확정/탈락 여부를 판정한다. 판정은 항상
 * "과대 확정이 없는" 보수적 방향으로 이루어진다(애매하면 확정 대신 진행중으로 남긴다).
 *
 * - 진출 확정: (a) 자기 조 1·2위를 보장받거나(이미 결판난 동률은 위협으로 세지 않음), (b) 자기 조
 *   일정이 끝나 3위가 확정된 상태에서, 다른 11개 조 중 아직 이 팀을 앞지를 "가능성이 있는" 조가
 *   7개 이하인 경우(즉 최악의 경우에도 3위 진출 8자리 안에 든다).
 * - 탈락 확정: (a) 자기 조 1·2위 진출이 수학적으로 불가능하고, (b) 자기 조 일정이 모두 끝났으며,
 *   (c-1) 자기 조 3위가 아니거나(4위 확정), (c-2) 3위이더라도 다른 조 중 `classifyGroupThreat`가
 *   'ahead'(승점만으로 이미 확정적으로 앞선다고 증명 가능)로 판정한 조가 8개 이상이라 3위 진출
 *   경로도 막힌 경우 — 다른 조 자체가 아직 안 끝났어도 승점 하한선만으로 확정 가능하다.
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

  for (const group of groups) {
    const info = perGroupInfo[group]
    const teamIds = groupTeams[group]

    for (const teamId of teamIds) {
      const s = info.standings[teamId]
      const myOrderIndex = info.order.indexOf(teamId)
      const rivals = teamIds.filter((id) => id !== teamId)

      // 1) 자기 조 1·2위 확정(이미 결판난 동률은 위협에서 제외)
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

      // 3) 3위 확정 — 다른 11개 조를 각각 확정 위협/확정 안전/미정으로 분류한다.
      const otherGroups = groups.filter((g) => g !== group)
      let aheadCount = 0
      let pendingCount = 0
      for (const g of otherGroups) {
        const verdict = classifyGroupThreat(perGroupInfo[g], groupTeams[g], s)
        if (verdict === 'ahead') aheadCount += 1
        else if (verdict === 'pending') pendingCount += 1
      }

      if (aheadCount + pendingCount <= THIRD_PLACE_SLOTS - 1) {
        statuses[teamId] = 'advancing'
        continue
      }

      statuses[teamId] = aheadCount >= THIRD_PLACE_SLOTS ? 'eliminated' : 'undecided'
    }
  }

  return statuses
}

/**
 * 조별 순위 1~4위 각각이 "더 이상 절대 바뀔 수 없는" 상태인지(정확한 순위 확정 여부) 계산한다.
 * 32강 대진표에서 특정 슬롯(조 1위/2위)의 실제 진출 팀이 확정되었는지 표시할 때 사용한다.
 * 반환값은 현재 순위(rankGroupTeams 결과) 순서를 그대로 따르는 boolean 배열이다.
 */
export type ScenarioVerdict = 'advance' | 'eliminated' | 'tiebreak'

export interface OtherMatchOutcome {
  key: 'aWin' | 'draw' | 'bWin'
  label: string
  verdict: ScenarioVerdict
  note?: string
}

export interface OurResultScenario {
  result: 'win' | 'draw' | 'loss'
  resultLabel: string
  ourFinalPoints: number
  outcomes: OtherMatchOutcome[]
  /** 3가지 동시경기 결과 모두 같은 판정으로 귀결되면 그 판정, 아니면 null(경우에 따라 갈림) */
  uniform: ScenarioVerdict | null
}

/**
 * 승점만으로 확정 가능한 최선/최악 순위 구간을 구해 타이브레이커 개입 없이 판가름 나는지 분류한다.
 * 최악의 경우에도 2위 안이면 'advance', 최선의 경우에도 3위 밖이면 'eliminated', 그 경계에
 * 걸쳐 있으면(동률 상대에 따라 2위/3위가 갈릴 수 있으면) 'tiebreak'. 'eliminated'이면서 최선/최악
 * 순위가 정확히 3위로 고정되는 경우, 3위 진출 와일드카드 경로가 남아있음을 별도로 알린다.
 */
function classifyByPoints(
  finalPoints: Record<string, number>,
  teamId: string,
  groupTeamIds: string[],
): { verdict: ScenarioVerdict; thirdPlaceRoute: boolean } {
  const ourPts = finalPoints[teamId]
  const others = groupTeamIds.filter((id) => id !== teamId).map((id) => finalPoints[id])
  const strictlyAbove = others.filter((p) => p > ourPts).length
  const equalCount = others.filter((p) => p === ourPts).length
  const bestPos = strictlyAbove + 1
  const worstPos = strictlyAbove + equalCount + 1
  if (worstPos <= 2) return { verdict: 'advance', thirdPlaceRoute: false }
  if (bestPos > 2) return { verdict: 'eliminated', thirdPlaceRoute: bestPos === 3 && worstPos === 3 }
  return { verdict: 'tiebreak', thirdPlaceRoute: false }
}

/**
 * 조별리그 2경기를 마친 시점, 마지막(3번째) 라운드에서 우리 팀의 경기 결과(승/무/패) ×
 * 동시에 열리는 나머지 두 팀의 경기 결과(A승/무/B승) — 총 9가지 조합에 대해 32강 1·2위
 * 직행 진출 여부를 승점 기준으로 판정한다. 골득실 등 세부 타이브레이커가 필요한 경계 상황은
 * 'tiebreak'으로 별도 표시한다(3위 진출 와일드카드 경로는 다른 조 결과에 좌우되므로 제외).
 */
export function analyzeLastMatchdayScenarios(
  groupTeamIds: string[],
  matches: GroupMatch[],
  teamId: string,
  otherTeamAId: string,
  otherTeamBId: string,
): OurResultScenario[] {
  const standings = computeStandings(groupTeamIds, matches)
  const basePoints = Object.fromEntries(groupTeamIds.map((id) => [id, standings[id].points])) as Record<string, number>
  const opponentId = groupTeamIds.find((id) => id !== teamId && id !== otherTeamAId && id !== otherTeamBId)

  if (!opponentId) return []

  const OUR_RESULTS: { key: 'win' | 'draw' | 'loss'; label: string; our: number; opp: number }[] = [
    { key: 'win', label: '승리', our: 3, opp: 0 },
    { key: 'draw', label: '무승부', our: 1, opp: 1 },
    { key: 'loss', label: '패배', our: 0, opp: 3 },
  ]
  const OTHER_RESULTS: { key: 'aWin' | 'draw' | 'bWin'; label: string; a: number; b: number }[] = [
    { key: 'aWin', label: `${TEAMS_BY_ID[otherTeamAId].nameKo} 승`, a: 3, b: 0 },
    { key: 'draw', label: '무승부', a: 1, b: 1 },
    { key: 'bWin', label: `${TEAMS_BY_ID[otherTeamBId].nameKo} 승`, a: 0, b: 3 },
  ]

  return OUR_RESULTS.map((r) => {
    const ourFinalPoints = basePoints[teamId] + r.our
    const opponentFinalPoints = basePoints[opponentId] + r.opp

    const outcomes: OtherMatchOutcome[] = OTHER_RESULTS.map((o) => {
      const finalPoints: Record<string, number> = {
        [teamId]: ourFinalPoints,
        [opponentId]: opponentFinalPoints,
        [otherTeamAId]: basePoints[otherTeamAId] + o.a,
        [otherTeamBId]: basePoints[otherTeamBId] + o.b,
      }
      const { verdict, thirdPlaceRoute } = classifyByPoints(finalPoints, teamId, groupTeamIds)
      const note =
        verdict === 'tiebreak'
          ? '승점이 같아 상호전적 → 골득실 → 다득점 등 타이브레이커로 순위가 결정됩니다.'
          : verdict === 'eliminated' && thirdPlaceRoute
            ? '조 3위로 마감 — 다른 조 3위팀들과의 성적 비교 결과에 따라 32강에 진출할 수도 있습니다.'
            : undefined
      return { key: o.key, label: o.label, verdict, note }
    })

    const uniform = outcomes.every((o) => o.verdict === outcomes[0].verdict) ? outcomes[0].verdict : null

    return { result: r.key, resultLabel: r.label, ourFinalPoints, outcomes, uniform }
  })
}

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

export interface ThirdPlaceRouteInfo {
  group: GroupLetter
  ourPoints: number
  ourGoalDiff: number
  ourGoalsFor: number
  /** 3위 자리가 이미 수학적으로 확정됐고(그 조 전체가 안 끝났어도 포함) 우리보다 앞서는 조 수 */
  aheadFinished: number
  /** 3위 자리가 이미 확정됐고 우리보다 뒤처진 조 수 */
  behindFinished: number
  /** 3위 자리가 아직 확정되지 않은 조 수 — 결과에 따라 위협이 될 수도, 안 될 수도 있음 */
  pendingGroups: number
  pendingGroupLetters: GroupLetter[]
  /** 미확정 조 중 이 개수 이하에서만 우리보다 나은 3위팀이 나와야 진출 확정(초과하면 탈락) */
  maxPendingAllowed: number
}

/**
 * 자기 조가 끝나 3위로 확정됐지만(진출확정/탈락확정 어느 쪽도 아닌 'undecided' 상태) 32강 진출
 * 여부가 다른 조 결과에 따라 정확히 어떻게 갈리는지 설명하기 위한 정보를 계산한다. 자기 조가 아직
 * 안 끝났거나 3위가 아니면(1·2위 또는 4위) null.
 *
 * 다른 조가 "이미 확정된 위협/안전"인지는 그 조 전체가 끝났는지가 아니라 `classifyGroupThreat`로
 * 승점 하한선만으로 판정한다 — 승점은 남은 경기로 줄어들 수 없으므로, 그 조 일정이 남아있어도
 * 안전하게 위협/안전으로 분류할 수 있는 경우가 있다(computeQualificationStatuses와 동일한 기준).
 */
export function analyzeThirdPlaceRoute(
  teamId: string,
  groupTeams: Record<GroupLetter, string[]>,
  matches: GroupMatch[],
): ThirdPlaceRouteInfo | null {
  const myGroup = GROUP_LETTERS.find((g) => groupTeams[g]?.includes(teamId))
  if (!myGroup) return null

  const myGroupMatches = matches.filter((m) => m.group === myGroup)
  if (myGroupMatches.length < 6) return null

  const myStandings = computeStandings(groupTeams[myGroup], myGroupMatches)
  const myOrder = rankGroupTeams(groupTeams[myGroup], myGroupMatches)
  if (myOrder[2] !== teamId) return null

  const myStanding = myStandings[teamId]

  let aheadFinished = 0
  let pendingGroups = 0
  const pendingGroupLetters: GroupLetter[] = []

  for (const group of GROUP_LETTERS) {
    if (group === myGroup) continue
    const teamIds = groupTeams[group]
    if (!teamIds || teamIds.length < 4) continue
    const groupMatches = matches.filter((m) => m.group === group)
    const standings = computeStandings(teamIds, groupMatches)
    const finished = groupMatches.length >= 6
    const order = rankGroupTeams(teamIds, groupMatches)
    const verdict = classifyGroupThreat({ standings, finished, thirdTeamId: order[2] }, teamIds, myStanding)
    if (verdict === 'pending') {
      pendingGroups += 1
      pendingGroupLetters.push(group)
    } else if (verdict === 'ahead') {
      aheadFinished += 1
    }
  }

  return {
    group: myGroup,
    ourPoints: myStanding.points,
    ourGoalDiff: myStanding.goalsFor - myStanding.goalsAgainst,
    ourGoalsFor: myStanding.goalsFor,
    aheadFinished,
    behindFinished: 11 - aheadFinished - pendingGroups,
    pendingGroups,
    pendingGroupLetters,
    maxPendingAllowed: Math.max(0, THIRD_PLACE_SLOTS - 1 - aheadFinished),
  }
}
