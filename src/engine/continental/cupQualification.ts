import type { TeamRatings } from '../../types/team'
import type { GroupStanding } from '../../types/group'
import type { CupFormat } from '../../data/continental/formats'
import { nationsByConfederation, ALL_NATIONS_BY_ID } from '../../data/nations'
import { simulateScoreRaw } from '../matchCore'
import { hostAdvantageFor } from '../config'
import { computeStandings, rankGroupTeams } from '../tiebreakers'
import { snakeSeed } from '../qualification/generic'
import { createSeededRandom, type RandomFn } from '../rng'
import type { CupMatch } from './runCup'

/**
 * 대륙컵 예선(슬롯 정확·포맷 근사). 개최국은 자동 진출, 코파의 주 연맹(CONMEBOL)은 전원 자동,
 * 나머지 슬롯은 예선 조별리그(각 조 상위 2 + 최고 순위 잔여)로 채운다. 월드컵 지역예선과 같은 철학:
 * 본선 참가국 수·개최국 규칙은 정확히 지키고, 예선 세부 포맷은 근사한다. 순수 함수(전역 미사용).
 */

export interface CupQualGroup {
  teams: string[]
  matches: CupMatch[]
  ranking: string[]
  standings: Record<string, GroupStanding>
}

export interface CupQualResult {
  /** 예선 조(있을 때). 자동 진출만으로 채워지면 빈 배열. */
  groups: CupQualGroup[]
  /** 자동 진출(개최국 + 코파 주 연맹). */
  autoQualified: string[]
  /** 예선 통과국(자동 진출 제외). */
  earned: string[]
  /** 최종 본선 참가국(길이 = format.teams) = 자동 + 통과. */
  qualified: string[]
}

const ratingOf = (id: string, ratings: Record<string, TeamRatings>) => ratings[id]?.overall ?? 0
const rankOf = (id: string, rankByTeam: Record<string, number>) => rankByTeam[id] ?? ALL_NATIONS_BY_ID[id]?.fifaRankApprox ?? 999
const hostAdv = (id: string, hostSet: Set<string>) => (hostSet.has(id) ? hostAdvantageFor(id) : 0)

function roundRobin(teams: string[]): Array<{ home: string; away: string; matchday: number }> {
  const ids = [...teams]
  if (ids.length % 2 === 1) ids.push('__BYE__')
  const n = ids.length
  const out: Array<{ home: string; away: string; matchday: number }> = []
  const arr = [...ids]
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const home = arr[i]
      const away = arr[n - 1 - i]
      if (home !== '__BYE__' && away !== '__BYE__') out.push(r % 2 === 0 ? { home, away, matchday: r + 1 } : { home: away, away: home, matchday: r + 1 })
    }
    arr.splice(1, 0, arr.pop() as string)
  }
  return out
}

function simGroup(teams: string[], ratings: Record<string, TeamRatings>, hostSet: Set<string>, mode: CupFormat['groupTiebreak'], rand: RandomFn): CupQualGroup {
  const matches: CupMatch[] = []
  for (const { home, away, matchday } of roundRobin(teams)) {
    const s = simulateScoreRaw(ratings[home], ratings[away], hostAdv(home, hostSet), hostAdv(away, hostSet), rand)
    matches.push({ homeTeamId: home, awayTeamId: away, homeGoals: s.homeGoals, awayGoals: s.awayGoals, group: 0, matchday })
  }
  return { teams, matches, ranking: rankGroupTeams(teams, matches, mode), standings: computeStandings(teams, matches) }
}

/** 여러 예선 조에서 같은 순번(2위끼리 등) 팀을 전체 기록으로 횡단 정렬한다. */
function rankByStanding(entries: Array<{ teamId: string; s: GroupStanding }>): string[] {
  return [...entries]
    .sort((a, b) => b.s.points - a.s.points || (b.s.goalsFor - b.s.goalsAgainst) - (a.s.goalsFor - a.s.goalsAgainst) || b.s.goalsFor - a.s.goalsFor || a.teamId.localeCompare(b.teamId))
    .map((e) => e.teamId)
}

export function runCupQualification(
  format: CupFormat,
  ratings: Record<string, TeamRatings>,
  hostIds: string[],
  seed: string,
  rankByTeam: Record<string, number> = {},
): CupQualResult {
  const [primary, ...guests] = format.confeds
  const primaryPool = nationsByConfederation(primary).map((t) => t.id)
  const guestPool = guests.flatMap((c) => nationsByConfederation(c).map((t) => t.id))
  const hostSet = new Set(hostIds.filter((h) => primaryPool.includes(h) || guestPool.includes(h)))

  const autoQualified: string[] = [...hostSet]
  // 코파형: 주 연맹(CONMEBOL) 전원 자동 진출(슬롯 이내일 때).
  if (guests.length > 0 && primaryPool.length <= format.teams) {
    for (const id of primaryPool) if (!hostSet.has(id)) autoQualified.push(id)
  }
  const autoSet = new Set(autoQualified)
  const remaining = format.teams - autoQualified.length

  // 예선 대상 풀: 아직 자동 진출 안 한 팀들.
  const candidatePool = (guests.length > 0 ? guestPool : primaryPool).filter((id) => !autoSet.has(id))

  // 통합 예선(AFC 아시안컵 등, combinedWcq): 월드컵 지역예선과 같은 캠페인이므로 별도 예선을 다시 치르지
  // 않고, 월드컵 예선 성적이 반영된 랭킹(rankByTeam)으로 본선 진출국을 가린다(현실의 통합 예선 반영).
  if (format.qual.style === 'combinedWcq') {
    const earned = [...candidatePool]
      .sort((a, b) => rankOf(a, rankByTeam) - rankOf(b, rankByTeam) || a.localeCompare(b))
      .slice(0, Math.max(0, remaining))
    return { groups: [], autoQualified, earned, qualified: [...autoQualified, ...earned].slice(0, format.teams) }
  }

  // 예선 불필요(후보가 슬롯 이하): 전원 통과.
  if (candidatePool.length <= remaining) {
    const earned = candidatePool
    return { groups: [], autoQualified, earned, qualified: [...autoQualified, ...earned].slice(0, format.teams) }
  }

  // 예선 조별리그: 각 조 상위 2 + 잔여는 최고 순위 3위/2위로. 조 수 = ceil(remaining/2).
  const numGroups = Math.max(1, Math.ceil(remaining / 2))
  const sorted = [...candidatePool].sort((a, b) => ratingOf(b, ratings) - ratingOf(a, ratings) || rankOf(a, rankByTeam) - rankOf(b, rankByTeam) || a.localeCompare(b))
  const grouped = snakeSeed(sorted, numGroups)
  const groups = grouped.map((teams, gi) => simGroup(teams, ratings, hostSet, format.groupTiebreak, createSeededRandom(`${seed}-${format.id}-QUAL-G${gi}`)))

  // 진출: 각 조 1위 전원 → 각 조 2위 횡단 정렬 → 필요 시 3위 순으로 remaining 채움.
  const earned: string[] = []
  const byRank = (idx: number) => groups.filter((g) => g.ranking[idx]).map((g) => ({ teamId: g.ranking[idx], s: g.standings[g.ranking[idx]] }))
  for (let idx = 0; idx < format.teamsPerGroup && earned.length < remaining; idx++) {
    for (const id of rankByStanding(byRank(idx))) {
      if (earned.length >= remaining) break
      if (!earned.includes(id)) earned.push(id)
    }
  }

  return { groups, autoQualified, earned: earned.slice(0, remaining), qualified: [...autoQualified, ...earned].slice(0, format.teams) }
}
