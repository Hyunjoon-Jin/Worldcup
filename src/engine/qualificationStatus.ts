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

/**
 * 잔여 R경기에서 승점 N점 이상을 채우는 데 필요한 최소 승수를 구한다(나머지는 무승부로 채운다고
 * 가정한 하한선). 무승부만으로 채워지면(N <= R) 0승으로 충분하다.
 */
function minWinsToReach(neededPoints: number, remainingGames: number): number {
  if (neededPoints <= 0) return 0
  if (neededPoints <= remainingGames) return 0
  return Math.min(remainingGames, Math.ceil((neededPoints - remainingGames) / 2))
}

function buildResultHint(neededPoints: number, remainingGames: number, currentPoints: number): string {
  if (neededPoints <= 0) return `이미 승점 ${currentPoints}점을 확보해 추가 조건 없이 위협입니다.`
  const wins = minWinsToReach(neededPoints, remainingGames)
  if (wins === 0) return `잔여 ${remainingGames}경기에서 승점 ${neededPoints}점 이상 필요 — 무승부만 거둬도 충분합니다.`
  if (wins >= remainingGames) return `잔여 ${remainingGames}경기 전부 승리해야 승점 ${neededPoints}점 이상을 채울 수 있습니다.`
  return `잔여 ${remainingGames}경기에서 승점 ${neededPoints}점 이상 필요 — 최소 ${wins}승(나머지는 무승부)이면 충분합니다.`
}

/**
 * 'pending' 판정인 조에서, 아직 우리를 앞지를 수학적 가능성이 남은 후보팀들과 각자 필요한
 * 조건을 계산한다. 그 조의 최종 3위 승점이 우리보다 높아지려면 "4팀 중 최소 3팀의 최종 승점이
 * 우리보다 높아야" 한다(3번째로 높은 값이 우리를 넘는다는 것은 곧 상위 3개 값이 모두 우리보다
 * 높다는 것과 동치). 이미 확정적으로 우리보다 뒤처지는 팀(guaranteed behind)은 그 3자리 중
 * 하나도 채울 수 없으므로, 나머지 후보팀들이 그 3자리를 전부 채워야 한다 — 즉 필요 인원수는
 * 후보 수와 무관하게 항상 3명이다(단, 후보가 3명보다 적을 수는 없다 — 있다면 애초에 'pending'이
 * 아니라 'behind'로 판정됐을 것이다).
 */
function buildContenders(
  teamIds: string[],
  standings: Record<string, GroupStanding>,
  ourPoints: number,
): { contenders: ThirdPlaceContender[]; contendersNeeded: number } {
  const contenders = teamIds
    .filter((id) => maxPossiblePoints(standings[id]) >= ourPoints)
    .map((id) => {
      const s = standings[id]
      const remainingGames = MATCHES_PER_TEAM - s.played
      const neededPoints = Math.max(0, ourPoints + 1 - s.points)
      return {
        teamId: id,
        currentPoints: s.points,
        remainingGames,
        neededPoints,
        alreadyAhead: neededPoints <= 0,
        resultHint: buildResultHint(neededPoints, remainingGames, s.points),
      }
    })
    .sort((a, b) => a.neededPoints - b.neededPoints)

  return { contenders, contendersNeeded: Math.min(3, contenders.length) }
}

export type GroupThreatVerdict = 'ahead' | 'behind' | 'pending'

/**
 * ourStandingExact=false일 때는 ourStanding이 "마지막 경기 결과를 가정한 가상의 승점"만
 * 확실할 뿐, 골득실/다득점은 아직 실제로 뛰지 않은 경기의 것이라 알 수 없다(그 경기 직전까지의
 * 값을 그대로 들고 있을 뿐 가정한 승/무/패의 실제 스코어는 반영되지 않는다). 이 상태에서 승점이
 * 같은 조와 골득실 타이브레이커까지 비교해버리면, 우리가 아직 넣지 않은 득점을 0으로 취급해
 * 부당하게 "위협"으로 판정하는 오류가 생긴다 — 그래서 승점이 같으면 골득실 비교로 넘어가지
 * 않고 'pending'(아직 알 수 없음)으로 남긴다.
 */
function classifyGroupThreat(
  other: { standings: Record<string, GroupStanding>; finished: boolean; thirdTeamId: string },
  otherTeamIds: string[],
  ourStanding: GroupStanding,
  ourStandingExact = true,
): GroupThreatVerdict {
  if (other.finished) {
    const candidate = other.standings[other.thirdTeamId]
    if (candidate.points !== ourStanding.points) {
      return candidate.points > ourStanding.points ? 'ahead' : 'behind'
    }
    if (!ourStandingExact) return 'pending'
    return thirdPlaceComparator(candidate, ourStanding) < 0 ? 'ahead' : 'behind'
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
export type ScenarioVerdict = 'advance' | 'eliminated' | 'tiebreak' | 'thirdPending'

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
  /**
   * 3가지 동시경기 결과 모두 판정과 보충 설명(note)이 완전히 같을 때만 채워진다(경우에 따라
   * 갈리면 null). note까지 함께 비교하는 이유: 판정이 똑같이 'eliminated'라도 한쪽은 정확히
   * 3위라 3위 와일드카드 경로가 남아있고 다른 쪽은 4위 확정이라 아예 가능성이 없는 경우처럼,
   * 겉보기 판정은 같아도 실제 의미가 다를 수 있기 때문이다 — 이 경우는 하나로 뭉뚱그리지 않고
   * 항상 개별 결과를 그대로 보여준다.
   */
  uniform: ScenarioVerdict | null
  uniformNote?: string
}

export type H2HResult = 'win' | 'draw' | 'loss'

const H2H_LABEL: Record<H2HResult, string> = { win: '승리', draw: '무승부', loss: '패배' }

/** 이미 치른 경기 기록에서 teamId 관점의 상호전적 결과를 찾는다(없으면 아직 안 붙은 경기). */
function h2hOutcome(teamId: string, rivalId: string, ownMatches: GroupMatch[]): H2HResult | null {
  const match = ownMatches.find(
    (m) => (m.homeTeamId === teamId && m.awayTeamId === rivalId) || (m.homeTeamId === rivalId && m.awayTeamId === teamId),
  )
  if (!match) return null
  const isHome = match.homeTeamId === teamId
  const gf = isHome ? match.homeGoals : match.awayGoals
  const ga = isHome ? match.awayGoals : match.homeGoals
  return gf > ga ? 'win' : gf < ga ? 'loss' : 'draw'
}

/**
 * 3위 도달 가능(bestPos <= 3) 구간의 와일드카드 판정을 다른 11개 조의 현재 실제 상황 기준으로
 * 내린다. prefix가 있으면(타이브레이커가 이미 상호전적으로 풀려 3위가 확정된 경우) 그 설명을
 * note 앞에 붙인다.
 */
function evaluateThirdPlaceRoute(
  ourPts: number,
  baseStanding: GroupStanding,
  evaluateWildcard: (ourStanding: GroupStanding) => 'advancing' | 'eliminated' | 'undecided',
  ownRankCertain: boolean,
  prefix?: string,
): { verdict: ScenarioVerdict; note?: string } {
  const ourHypotheticalStanding: GroupStanding = { ...baseStanding, points: ourPts, played: 3 }
  const wildcard = evaluateWildcard(ourHypotheticalStanding)
  const p = prefix ? `${prefix} ` : ''

  if (wildcard === 'eliminated') {
    return {
      verdict: 'eliminated',
      note:
        p +
        (ownRankCertain
          ? '조 3위가 확정되지만, 다른 조 3위팀들의 현재 성적이 이미 앞서 있어 32강 진출 경로가 없습니다.'
          : '3위가 되어도 다른 조 3위팀들의 현재 성적에 밀려 32강 진출 경로가 없습니다.'),
    }
  }
  if (ownRankCertain && wildcard === 'advancing') {
    return {
      verdict: 'advance',
      note: p + '조 3위가 확정되고, 다른 조들의 현재 상황을 기준으로도 3위 진출 8자리 안에 듭니다.',
    }
  }
  return {
    verdict: 'thirdPending',
    note:
      p +
      (ownRankCertain
        ? '조 3위가 확정되지만, 아직 결과가 나오지 않은 다른 조들에 따라 32강 진출 여부가 갈립니다.'
        : '3위 또는 4위가 될 수 있어, 자기 조 순위와 다른 조 결과에 따라 32강 진출 여부가 함께 갈립니다.'),
  }
}

/**
 * 승점만으로 확정 가능한 최선/최악 순위 구간을 구하고, 1·2위 직행이 안 되는 경우에는 3위
 * 와일드카드 경로까지 "다른 11개 조의 현재 실제 상황"을 기준으로 실제 판정한다(단순히
 * "3위면 가능성이 있다"는 식으로 얼버무리지 않는다).
 *
 * - worstPos <= 2: 최악의 경우에도 1·2위 확정 → 'advance'
 * - bestPos <= 2 (그러나 worstPos > 2): 승점이 같아 2위/3위 경계가 타이브레이커에 달림. 동률
 *   상대가 정확히 1팀이면 이미 치른(또는 이번에 가정한) 맞대결 결과가 공식 규정상 최우선
 *   기준이므로, 그 결과가 승/패로 갈렸다면 타이브레이커가 이미 풀린 것으로 보고 곧바로
 *   'advance'(맞대결 승) 또는 3위 진출 경로 판정('advance'|'eliminated'|'thirdPending', 맞대결
 *   패)으로 확정한다. 맞대결이 무승부였거나 동률 상대가 2팀 이상(3파전)이면 골득실 등 추가
 *   기준이 필요해 'tiebreak'로 남기되, 어떤 팀과 왜 갈리는지 구체적으로 설명한다.
 * - bestPos > 3: 최선의 경우에도 4위 확정 → 3위 진출 경로 자체가 없음 → 'eliminated'
 * - 그 외(3위 도달 가능): evaluateWildcard로 실제 다른 조 상황 대비 3위 진출 가능성을 판정해
 *   'advance'(3위 확정 + 와일드카드 확정 진출) / 'eliminated'(3위가 되어도 다른 조에 밀림) /
 *   'thirdPending'(아직 다른 조 결과가 안 나와 갈릴 수 있음 — "탈락"이 아니라 "미정")으로 나눈다.
 *   자기 조 안에서도 3위/4위가 확정이 아니면(동률로 4위로 밀릴 수도 있으면) 'advance'로는 단정하지
 *   않고 'thirdPending'까지만 인정한다(과대 확정 방지).
 */
function classifyScenario(
  finalPoints: Record<string, number>,
  teamId: string,
  groupTeamIds: string[],
  baseStanding: GroupStanding,
  evaluateWildcard: (ourStanding: GroupStanding) => 'advancing' | 'eliminated' | 'undecided',
  h2hByRival: Record<string, H2HResult | null>,
): { verdict: ScenarioVerdict; note?: string } {
  const ourPts = finalPoints[teamId]
  const rivals = groupTeamIds.filter((id) => id !== teamId)
  const others = rivals.map((id) => finalPoints[id])
  const strictlyAbove = others.filter((p) => p > ourPts).length
  const equalCount = others.filter((p) => p === ourPts).length
  const bestPos = strictlyAbove + 1
  const worstPos = strictlyAbove + equalCount + 1

  if (worstPos <= 2) return { verdict: 'advance' }

  if (bestPos <= 2) {
    const tiedRivals = rivals.filter((id) => finalPoints[id] === ourPts)

    if (tiedRivals.length === 1) {
      const rivalId = tiedRivals[0]
      const rivalName = TEAMS_BY_ID[rivalId].nameKo
      const h2h = h2hByRival[rivalId]

      if (h2h === 'win') {
        return {
          verdict: 'advance',
          note: `${rivalName}와(과) 승점이 같지만, 맞대결에서 승리해 상호전적 기준으로 앞서 2위가 확정됩니다.`,
        }
      }
      if (h2h === 'loss') {
        return evaluateThirdPlaceRoute(
          ourPts,
          baseStanding,
          evaluateWildcard,
          true,
          `${rivalName}와(과) 승점이 같지만, 맞대결에서 패해 상호전적 기준으로 밀려 3위로 내려갑니다.`,
        )
      }
      return {
        verdict: 'tiebreak',
        note: `${rivalName}와(과) 승점이 같고 맞대결도 무승부라 상호전적으로 갈리지 않습니다 — 조 전체 골득실 → 다득점 → 페어플레이 → FIFA 랭킹 순으로 2·3위가 결정됩니다.`,
      }
    }

    const names = tiedRivals
      .map((id) => {
        const h2h = h2hByRival[id]
        const label = h2h ? `맞대결 ${H2H_LABEL[h2h]}` : '맞대결 기록 없음'
        return `${TEAMS_BY_ID[id].nameKo}(${label})`
      })
      .join(', ')
    return {
      verdict: 'tiebreak',
      note: `${names}와(과) 세 팀이 승점 동률 — 세 팀 간 미니리그(상호전적 승점 → 골득실 → 다득점)로 먼저 비교하고, 그래도 갈리지 않으면 조 전체 골득실 → 다득점 → 페어플레이 → FIFA 랭킹 순으로 2·3위가 결정됩니다.`,
    }
  }

  if (bestPos > 3) {
    return { verdict: 'eliminated', note: '조 4위가 확정되어 32강 진출 경로가 없습니다.' }
  }

  // 3위 도달 가능(bestPos <= 3) — 다른 11개 조의 실제 현재 상황을 기준으로 와일드카드 경로를 판정한다.
  const ownRankCertain = worstPos <= 3 // 자기 조 3위 자체는 확정(4위로 밀릴 동률 상대가 없음)
  return evaluateThirdPlaceRoute(ourPts, baseStanding, evaluateWildcard, ownRankCertain)
}

/**
 * 조별리그 2경기를 마친 시점, 마지막(3번째) 라운드에서 우리 팀의 경기 결과(승/무/패) ×
 * 동시에 열리는 나머지 두 팀의 경기 결과(A승/무/B승) — 총 9가지 조합에 대해 32강 진출 여부를
 * 판정한다. 1·2위 직행이 불가능해 3위 경쟁으로 넘어가는 경우, 다른 11개 조의 "현재 실제 상황"을
 * 그대로 반영해 3위 와일드카드 진출 가능성까지 함께 판정한다(단순히 "3위면 실패"로 뭉개지 않는다).
 */
export function analyzeLastMatchdayScenarios(
  group: GroupLetter,
  groupTeams: Record<GroupLetter, string[]>,
  matches: GroupMatch[],
  teamId: string,
  otherTeamAId: string,
  otherTeamBId: string,
): OurResultScenario[] {
  const groupTeamIds = groupTeams[group]
  const ownMatches = matches.filter((m) => m.group === group)
  const standings = computeStandings(groupTeamIds, ownMatches)
  const basePoints = Object.fromEntries(groupTeamIds.map((id) => [id, standings[id].points])) as Record<string, number>
  const opponentId = groupTeamIds.find((id) => id !== teamId && id !== otherTeamAId && id !== otherTeamBId)

  if (!opponentId) return []

  const otherGroupsInfo: Partial<
    Record<GroupLetter, { standings: Record<string, GroupStanding>; finished: boolean; thirdTeamId: string; teamIds: string[] }>
  > = {}
  for (const g of GROUP_LETTERS) {
    if (g === group) continue
    const ids = groupTeams[g]
    if (!ids || ids.length < 4) continue
    const gMatches = matches.filter((m) => m.group === g)
    const gStandings = computeStandings(ids, gMatches)
    const order = rankGroupTeams(ids, gMatches)
    otherGroupsInfo[g] = { standings: gStandings, finished: gMatches.length >= 6, thirdTeamId: order[2], teamIds: ids }
  }

  const evaluateWildcard = (ourStanding: GroupStanding): 'advancing' | 'eliminated' | 'undecided' => {
    let aheadCount = 0
    let pendingCount = 0
    for (const info of Object.values(otherGroupsInfo)) {
      if (!info) continue
      const verdict = classifyGroupThreat(info, info.teamIds, ourStanding, false)
      if (verdict === 'ahead') aheadCount += 1
      else if (verdict === 'pending') pendingCount += 1
    }
    if (aheadCount + pendingCount <= THIRD_PLACE_SLOTS - 1) return 'advancing'
    return aheadCount >= THIRD_PLACE_SLOTS ? 'eliminated' : 'undecided'
  }

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

  const baseStanding = standings[teamId]
  // 라운드로빈 구조상 마지막 라운드가 "나 vs 상대"·"A vs B"로 나뉘므로, A·B와는 이미 앞선
  // 라운드에서 맞대결을 마쳤다 — 그 실제 결과를 그대로 상호전적 판단에 쓴다.
  const h2hVsA = h2hOutcome(teamId, otherTeamAId, ownMatches)
  const h2hVsB = h2hOutcome(teamId, otherTeamBId, ownMatches)

  return OUR_RESULTS.map((r) => {
    const ourFinalPoints = basePoints[teamId] + r.our
    const opponentFinalPoints = basePoints[opponentId] + r.opp
    // 상대(opponentId)와의 맞대결은 지금 가정하는 이번 결과 자체다.
    const h2hByRival: Record<string, H2HResult | null> = {
      [opponentId]: r.key,
      [otherTeamAId]: h2hVsA,
      [otherTeamBId]: h2hVsB,
    }

    const outcomes: OtherMatchOutcome[] = OTHER_RESULTS.map((o) => {
      const finalPoints: Record<string, number> = {
        [teamId]: ourFinalPoints,
        [opponentId]: opponentFinalPoints,
        [otherTeamAId]: basePoints[otherTeamAId] + o.a,
        [otherTeamBId]: basePoints[otherTeamBId] + o.b,
      }
      const { verdict, note } = classifyScenario(finalPoints, teamId, groupTeamIds, baseStanding, evaluateWildcard, h2hByRival)
      return { key: o.key, label: o.label, verdict, note }
    })

    const isUniform = outcomes.every(
      (o) => o.verdict === outcomes[0].verdict && o.note === outcomes[0].note,
    )
    const uniform = isUniform ? outcomes[0].verdict : null
    const uniformNote = isUniform ? outcomes[0].note : undefined

    return { result: r.key, resultLabel: r.label, ourFinalPoints, outcomes, uniform, uniformNote }
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

export interface ThirdPlaceContender {
  teamId: string
  currentPoints: number
  remainingGames: number
  /** 우리 승점을 넘어서기 위해 남은 경기에서 추가로 필요한 승점(이미 넘었으면 0) */
  neededPoints: number
  alreadyAhead: boolean
  /** 어떤 결과 조합이면 조건을 충족하는지 사람이 읽기 쉬운 한 줄 설명 */
  resultHint: string
}

export interface ThirdPlaceGroupDetail {
  group: GroupLetter
  verdict: GroupThreatVerdict
  /** 그 조의 현재 3위 후보(조가 끝났으면 확정된 3위팀) */
  candidateTeamId: string
  points: number
  goalDiff: number
  goalsFor: number
  finished: boolean
  /** 미정 판정일 때, 왜 아직 확정할 수 없는지 보충 설명 */
  note?: string
  /** 'pending' 조에서 아직 우리를 앞지를 가능성이 남은 후보팀들(안전 확정팀 제외) */
  contenders?: ThirdPlaceContender[]
  /** contenders 중 최소 몇 팀이 조건을 충족해야 이 조가 실제 위협이 되는지 */
  contendersNeeded?: number
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
  /** 다른 11개 조 각각의 상세 판정 — 위협조 → 미정조 → 안전조 순으로 정렬됨 */
  groupDetails: ThirdPlaceGroupDetail[]
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
  const groupDetails: ThirdPlaceGroupDetail[] = []

  for (const group of GROUP_LETTERS) {
    if (group === myGroup) continue
    const teamIds = groupTeams[group]
    if (!teamIds || teamIds.length < 4) continue
    const groupMatches = matches.filter((m) => m.group === group)
    const standings = computeStandings(teamIds, groupMatches)
    const finished = groupMatches.length >= 6
    const order = rankGroupTeams(teamIds, groupMatches)
    const candidateId = order[2]
    const candidate = standings[candidateId]
    const verdict = classifyGroupThreat({ standings, finished, thirdTeamId: candidateId }, teamIds, myStanding)

    if (verdict === 'pending') {
      pendingGroups += 1
      pendingGroupLetters.push(group)
    } else if (verdict === 'ahead') {
      aheadFinished += 1
    }

    const note = finished
      ? verdict === 'ahead'
        ? `조별리그 종료 — 확정 3위(승점 ${candidate.points}점)가 우리보다 앞섭니다.`
        : '조별리그 종료 — 확정 3위가 우리보다 승점·골득실이 낮아 안전합니다.'
      : verdict === 'ahead'
        ? `이미 승점 ${candidate.points}점을 확보해 남은 경기 결과와 무관하게 우리보다 앞섭니다.`
        : verdict === 'behind'
          ? '남은 경기를 모두 이겨도 우리보다 승점이 낮을 팀들이라 안전합니다.'
          : `이 조에서 몇 팀이 어떤 결과를 거두는지에 따라 우리를 앞지를 수도 있습니다 — 아래 조건을 확인하세요.`

    const { contenders, contendersNeeded } =
      verdict === 'pending' ? buildContenders(teamIds, standings, myStanding.points) : { contenders: [], contendersNeeded: 0 }

    groupDetails.push({
      group,
      verdict,
      candidateTeamId: candidateId,
      points: candidate.points,
      goalDiff: candidate.goalsFor - candidate.goalsAgainst,
      goalsFor: candidate.goalsFor,
      finished,
      note,
      contenders: verdict === 'pending' ? contenders : undefined,
      contendersNeeded: verdict === 'pending' ? contendersNeeded : undefined,
    })
  }

  const verdictOrder: Record<GroupThreatVerdict, number> = { ahead: 0, pending: 1, behind: 2 }
  groupDetails.sort((a, b) => verdictOrder[a.verdict] - verdictOrder[b.verdict] || a.group.localeCompare(b.group))

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
    groupDetails,
  }
}
