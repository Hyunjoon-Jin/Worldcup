import { TEAMS_BY_ID } from '../data/teams'
import type { GroupLetter, GroupStanding } from '../types/group'
import type { GroupMatch } from '../types/match'

function emptyStanding(teamId: string): GroupStanding {
  return {
    teamId,
    played: 0,
    win: 0,
    draw: 0,
    loss: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    fairPlayScore: 0,
  }
}

function applyMatch(standing: GroupStanding, goalsFor: number, goalsAgainst: number): GroupStanding {
  const win = goalsFor > goalsAgainst
  const draw = goalsFor === goalsAgainst
  return {
    ...standing,
    played: standing.played + 1,
    win: standing.win + (win ? 1 : 0),
    draw: standing.draw + (draw ? 1 : 0),
    loss: standing.loss + (!win && !draw ? 1 : 0),
    goalsFor: standing.goalsFor + goalsFor,
    goalsAgainst: standing.goalsAgainst + goalsAgainst,
    points: standing.points + (win ? 3 : draw ? 1 : 0),
  }
}

export function computeStandings(teamIds: string[], matches: GroupMatch[]): Record<string, GroupStanding> {
  const table: Record<string, GroupStanding> = Object.fromEntries(teamIds.map((id) => [id, emptyStanding(id)]))
  for (const m of matches) {
    if (table[m.homeTeamId]) table[m.homeTeamId] = applyMatch(table[m.homeTeamId], m.homeGoals, m.awayGoals)
    if (table[m.awayTeamId]) table[m.awayTeamId] = applyMatch(table[m.awayTeamId], m.awayGoals, m.homeGoals)
  }
  return table
}

type Comparator = (a: string, b: string) => number

/** 여러 비교 기준을 순서대로 시도해, 0이 아닌 첫 결과를 채택한다. */
function chain(...comparators: Comparator[]): Comparator {
  return (a, b) => {
    for (const cmp of comparators) {
      const result = cmp(a, b)
      if (result !== 0) return result
    }
    return 0
  }
}

function byPoints(stats: Record<string, GroupStanding>): Comparator {
  return (a, b) => stats[b].points - stats[a].points
}
function byGoalDifference(stats: Record<string, GroupStanding>): Comparator {
  return (a, b) => {
    const gdA = stats[a].goalsFor - stats[a].goalsAgainst
    const gdB = stats[b].goalsFor - stats[b].goalsAgainst
    return gdB - gdA
  }
}
function byGoalsScored(stats: Record<string, GroupStanding>): Comparator {
  return (a, b) => stats[b].goalsFor - stats[a].goalsFor
}
function byFairPlay(stats: Record<string, GroupStanding>): Comparator {
  // 페어플레이는 벌점이 적을수록 유리(오름차순)하므로 부호를 반대로 비교한다.
  return (a, b) => stats[a].fairPlayScore - stats[b].fairPlayScore
}
const byFifaRank: Comparator = (a, b) => TEAMS_BY_ID[a].fifaRankApprox - TEAMS_BY_ID[b].fifaRankApprox

/**
 * 2026 월드컵부터 적용되는 조별리그 순위 결정 기준(월드컵 사상 최초로 전체 골득실보다
 * 동률팀 간 상호전적을 우선한다):
 *   1) 승점 → 2) 상호전적 승점 → 3) 상호전적 골득실 → 4) 상호전적 다득점 →
 *   5) 조 전체 골득실 → 6) 조 전체 다득점 → 7) 페어플레이 → 8) FIFA 랭킹
 * 3팀 이상이 얽힌 경우 4위 팀과의 경기를 제외한 미니리그로 비교하고, 그 결과 일부만
 * 분리되고 나머지가 여전히 동률이면 남은 팀들에 대해 처음부터 다시 적용한다.
 */
export function rankGroupTeams(teamIds: string[], matches: GroupMatch[]): string[] {
  const overall = computeStandings(teamIds, matches)
  return resolveTier(teamIds, overall, matches)
}

function resolveTier(tier: string[], overall: Record<string, GroupStanding>, matches: GroupMatch[]): string[] {
  if (tier.length <= 1) return tier

  const pointsSorted = [...tier].sort(byPoints(overall))
  const result: string[] = []
  let i = 0
  while (i < pointsSorted.length) {
    let j = i + 1
    while (j < pointsSorted.length && overall[pointsSorted[j]].points === overall[pointsSorted[i]].points) j++
    const pointsTier = pointsSorted.slice(i, j)
    result.push(...resolvePointsTier(pointsTier, overall, matches))
    i = j
  }
  return result
}

function resolvePointsTier(tier: string[], overall: Record<string, GroupStanding>, matches: GroupMatch[]): string[] {
  if (tier.length <= 1) return tier

  const tierSet = new Set(tier)
  const h2hMatches = matches.filter((m) => tierSet.has(m.homeTeamId) && tierSet.has(m.awayTeamId))
  const expectedPairs = (tier.length * (tier.length - 1)) / 2
  const playedPairs = new Set(h2hMatches.map((m) => [m.homeTeamId, m.awayTeamId].sort().join('-'))).size

  // 동률팀 간 경기가 모두 끝나지 않았다면 상호전적을 적용할 수 없으므로 조 전체 기록으로만 비교한다.
  const h2h = playedPairs === expectedPairs ? computeStandings(tier, h2hMatches) : null

  const comparator = h2h
    ? chain(byPoints(h2h), byGoalDifference(h2h), byGoalsScored(h2h), byGoalDifference(overall), byGoalsScored(overall), byFairPlay(overall), byFifaRank)
    : chain(byGoalDifference(overall), byGoalsScored(overall), byFairPlay(overall), byFifaRank)

  const sorted = [...tier].sort(comparator)

  // 정렬 결과를 다시 "완전 동률(랭킹 제외 모든 기준 동일)" 묶음으로 나눠, 분리되지 않은
  // 잔여 동률팀들에 한해 같은 기준을 처음부터 재적용한다(4위 팀 제외 규정과 동일하게 서로의
  // 경기만으로 다시 미니리그를 구성).
  const tieBreakerWithoutRank = h2h
    ? chain(byPoints(h2h), byGoalDifference(h2h), byGoalsScored(h2h), byGoalDifference(overall), byGoalsScored(overall), byFairPlay(overall))
    : chain(byGoalDifference(overall), byGoalsScored(overall), byFairPlay(overall))

  const result: string[] = []
  let i = 0
  while (i < sorted.length) {
    let j = i + 1
    while (j < sorted.length && tieBreakerWithoutRank(sorted[i], sorted[j]) === 0) j++
    const stillTied = sorted.slice(i, j)
    if (stillTied.length > 1 && stillTied.length < tier.length) {
      result.push(...resolvePointsTier(stillTied, overall, matches))
    } else {
      result.push(...stillTied)
    }
    i = j
  }
  return result
}

export interface ThirdPlaceEntry {
  group: GroupLetter
  teamId: string
  standing: GroupStanding
  qualified: boolean
}

/** 12개 조 3위팀을 횡단 비교해 순위를 매기고 상위 8팀을 진출 처리한다(조 전체 기록 기준). */
export function rankThirdPlaceTeams(thirdPlaceByGroup: Partial<Record<GroupLetter, string>>, allMatches: GroupMatch[]): ThirdPlaceEntry[] {
  const entries = Object.entries(thirdPlaceByGroup) as [GroupLetter, string][]
  const withStats = entries.map(([group, teamId]) => {
    const groupMatches = allMatches.filter((m) => m.group === group)
    const stats = computeStandings([teamId], groupMatches)[teamId]
    return { group, teamId, standing: stats }
  })

  const overallLookup: Record<string, GroupStanding> = Object.fromEntries(withStats.map((e) => [e.teamId, e.standing]))
  const comparator = chain(
    byPoints(overallLookup),
    byGoalDifference(overallLookup),
    byGoalsScored(overallLookup),
    byFairPlay(overallLookup),
    byFifaRank,
  )
  const sortedIds = withStats.map((e) => e.teamId).sort(comparator)

  return sortedIds.map((teamId, idx) => {
    const entry = withStats.find((e) => e.teamId === teamId)!
    return { ...entry, qualified: idx < 8 }
  })
}
