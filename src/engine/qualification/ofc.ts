import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { simulateScoreRaw, type RandomFn } from '../matchCore'
import { computeStandings } from '../tiebreakers'
import { playSingleGroup, snakeSeed, type LockedLookup } from './generic'
import { GROUP_LETTERS } from './formats'
import type { GroupStanding } from '../../types/group'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult, QualMatch } from '../../types/qualification'

const byRank = (a: string, b: string) => {
  const rd = ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox
  return rd !== 0 ? rd : a.localeCompare(b) // 랭킹 동률 시 팀ID로 결정성 확보
}

function recordRank(overall: Record<string, GroupStanding>, a: string, b: string): number {
  const sa = overall[a]
  const sb = overall[b]
  if (!sa || !sb) return byRank(a, b)
  if (sb.points !== sa.points) return sb.points - sa.points
  const gda = sa.goalsFor - sa.goalsAgainst
  const gdb = sb.goalsFor - sb.goalsAgainst
  if (gdb !== gda) return gdb - gda
  if (sb.goalsFor !== sa.goalsFor) return sb.goalsFor - sa.goalsFor
  return byRank(a, b)
}

const OFC_GROUPS = 2 // 조별 후 크로스오버 녹아웃(실제 2026 오세아니아 예선)

/**
 * OFC 예선 (B16 — 실제 2026 오세아니아 예선 구조). 조별리그 후 녹아웃 결승.
 * - 조별리그: 2개 조 홈&어웨이 → 각 조 1·2위가 준결승 진출.
 * - 준결승(크로스오버 단판): A조 1위 vs B조 2위, B조 1위 vs A조 2위.
 * - 결승(단판): 준결승 승자끼리 → 승자 본선 직행(1장), 패자 대륙간 플레이오프행(1장).
 */
export function simulateOfc(
  teams: string[],
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
  locked?: LockedLookup,
  directSlots: number = SLOT_ALLOCATION.OFC.direct,
): QualificationResult {
  const sorted = [...teams].sort(byRank)
  const groups = snakeSeed(sorted, OFC_GROUPS)

  const allMatches: QualMatch[] = []
  const groupRankings: string[][] = []
  const groupLabels: string[] = []
  let md = 0

  const groupTop: string[][] = []
  groups.forEach((g, gi) => {
    const { matches, ranking, lastMatchday } = playSingleGroup(g, ratings, rand, {
      doubleRound: true,
      groupIndex: groupRankings.length,
      locked,
    })
    allMatches.push(...matches)
    groupRankings.push(ranking)
    groupLabels.push(`${GROUP_LETTERS[gi]}조`)
    md = Math.max(md, lastMatchday)
    groupTop.push(ranking)
  })

  // D26 공정화: 6팀 조와 5팀 조가 섞이므로, 큰 조 최하위 팀과의 경기를 제외해 성적 비교(결승 홈·순위)를 공정화한다.
  const minGroupSize = Math.min(...groupTop.map((g) => g.length))
  const excludedForRank = new Set<string>()
  for (const g of groupTop) for (const t of g.slice(minGroupSize)) excludedForRank.add(t)
  const overall = computeStandings(
    teams,
    excludedForRank.size ? allMatches.filter((m) => !excludedForRank.has(m.homeTeamId) && !excludedForRank.has(m.awayTeamId)) : allMatches,
  )
  const playKnockout = (a: string, b: string, mdNum: number, groupIdx: number): string => {
    const lk = locked?.(a, b, mdNum, groupIdx)
    const s = lk ?? simulateScoreRaw(ratings[a], ratings[b], 0, 0, rand) // 중립지 단판
    allMatches.push({ homeTeamId: a, awayTeamId: b, homeGoals: s.homeGoals, awayGoals: s.awayGoals, matchday: mdNum, group: groupIdx })
    return s.homeGoals >= s.awayGoals ? a : b // 무승부면 상위 시드 진출(결정성)
  }

  let qualified: string[] = []
  const playoff: string[] = []

  const a1 = groupTop[0]?.[0]
  const a2 = groupTop[0]?.[1]
  const b1 = groupTop[1]?.[0]
  const b2 = groupTop[1]?.[1]

  if (a1 && a2 && b1 && b2) {
    // 준결승: 조 1위가 홈(상위 시드). A1 vs B2, B1 vs A2.
    const sfMd = md + 1
    const finalMd = md + 2
    const sfIdx = groupRankings.length
    const w1 = playKnockout(a1, b2, sfMd, sfIdx)
    const w2 = playKnockout(b1, a2, sfMd, sfIdx)
    // 결승: 성적 상위가 홈.
    const finalHome = recordRank(overall, w1, w2) <= 0 ? w1 : w2
    const finalAway = finalHome === w1 ? w2 : w1
    const champ = playKnockout(finalHome, finalAway, finalMd, sfIdx)
    const runnerUp = champ === finalHome ? finalAway : finalHome
    qualified = [champ].slice(0, directSlots)
    playoff.push(runnerUp)
    // 표시용: 결승(승자·패자) → 준결승 탈락 2팀
    const sfLosers = [a1, a2, b1, b2].filter((t) => t !== w1 && t !== w2).sort((x, y) => recordRank(overall, x, y))
    groupRankings.push([champ, runnerUp, ...sfLosers])
    groupLabels.push('녹아웃')
    md = Math.max(md, finalMd)
  } else {
    // 예외적으로 팀이 부족하면 랭킹 상위 1팀 직행 + 다음 1팀 PO.
    qualified = sorted.slice(0, directSlots)
    if (sorted[directSlots]) playoff.push(sorted[directSlots])
  }

  const picked = new Set([...qualified, ...playoff])
  const rest = sorted.filter((id) => !picked.has(id))
  const standings = [...qualified, ...playoff, ...rest]

  return {
    confederation: 'OFC',
    standings,
    groups: groupRankings,
    groupLabels,
    qualified,
    playoff,
    matches: allMatches,
    matchdays: md,
  }
}
