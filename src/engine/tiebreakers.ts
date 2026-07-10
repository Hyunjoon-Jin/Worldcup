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

function byStatsComparator(stats: Record<string, GroupStanding>) {
  return (a: string, b: string) => {
    const sa = stats[a]
    const sb = stats[b]
    if (sb.points !== sa.points) return sb.points - sa.points
    const gdA = sa.goalsFor - sa.goalsAgainst
    const gdB = sb.goalsFor - sb.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    if (sb.goalsFor !== sa.goalsFor) return sb.goalsFor - sa.goalsFor
    if (sb.fairPlayScore !== sa.fairPlayScore) return sb.fairPlayScore - sa.fairPlayScore
    const rankA = TEAMS_BY_ID[a].fifaRankApprox
    const rankB = TEAMS_BY_ID[b].fifaRankApprox
    if (rankA !== rankB) return rankA - rankB
    return a.localeCompare(b)
  }
}

/**
 * 조 순위 결정: 승점 → 골득실 → 다득점 → (동점 시 상호전적 미니리그) → 페어플레이 → 랭킹 → 이름순.
 * 상호전적은 동점 팀들 사이의 경기가 모두 끝난 경우에만 적용하고, 그렇지 않으면 전체 기록으로 대체한다.
 */
export function rankGroupTeams(teamIds: string[], matches: GroupMatch[]): string[] {
  const overall = computeStandings(teamIds, matches)
  const sortedAll = [...teamIds].sort(byStatsComparator(overall))

  const result: string[] = []
  let i = 0
  while (i < sortedAll.length) {
    const tier = [sortedAll[i]]
    let j = i + 1
    while (j < sortedAll.length && overall[sortedAll[j]].points === overall[tier[0]].points) {
      tier.push(sortedAll[j])
      j++
    }

    if (tier.length === 1) {
      result.push(tier[0])
    } else {
      const tierSet = new Set(tier)
      const subMatches = matches.filter((m) => tierSet.has(m.homeTeamId) && tierSet.has(m.awayTeamId))
      const expectedPairs = (tier.length * (tier.length - 1)) / 2
      const playedPairs = new Set(subMatches.map((m) => [m.homeTeamId, m.awayTeamId].sort().join('-'))).size

      if (playedPairs === expectedPairs) {
        const subStats = computeStandings(tier, subMatches)
        const h2hSorted = [...tier].sort((a, b) => {
          const cmp = byStatsComparator(subStats)(a, b)
          if (cmp !== 0) return cmp
          return byStatsComparator(overall)(a, b)
        })
        result.push(...h2hSorted)
      } else {
        result.push(...tier)
      }
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

/** 12개 조 3위팀을 횡단 비교해 순위를 매기고 상위 8팀을 진출 처리한다. */
export function rankThirdPlaceTeams(thirdPlaceByGroup: Partial<Record<GroupLetter, string>>, allMatches: GroupMatch[]): ThirdPlaceEntry[] {
  const entries = Object.entries(thirdPlaceByGroup) as [GroupLetter, string][]
  const withStats = entries.map(([group, teamId]) => {
    const groupMatches = allMatches.filter((m) => m.group === group)
    const stats = computeStandings([teamId], groupMatches)[teamId]
    return { group, teamId, standing: stats }
  })

  const overallLookup: Record<string, GroupStanding> = Object.fromEntries(withStats.map((e) => [e.teamId, e.standing]))
  const sortedIds = withStats.map((e) => e.teamId).sort(byStatsComparator(overallLookup))

  return sortedIds.map((teamId, idx) => {
    const entry = withStats.find((e) => e.teamId === teamId)!
    return { ...entry, qualified: idx < 8 }
  })
}
