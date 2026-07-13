import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { simulateScoreRaw, type RandomFn } from '../matchCore'
import { computeStandings } from '../tiebreakers'
import { playSingleGroup, snakeSeed, type LockedLookup } from './generic'
import { QUAL_FORMAT, GROUP_LETTERS, type GroupsFormat } from './formats'
import type { GroupStanding } from '../../types/group'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult, QualMatch } from '../../types/qualification'

const byRank = (a: string, b: string) => {
  const rd = ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox
  return rd !== 0 ? rd : a.localeCompare(b) // 랭킹 동률 시 팀ID로 결정성 확보
}

/** 예선 전체 성적(승점 → 골득실 → 다득점 → 랭킹) 비교. 최고 2위 선발·미니토너먼트 시딩에 쓴다. */
function byRecord(overall: Record<string, GroupStanding>): (a: string, b: string) => number {
  return (a, b) => {
    const sa = overall[a]
    const sb = overall[b]
    if (sb.points !== sa.points) return sb.points - sa.points
    const gda = sa.goalsFor - sa.goalsAgainst
    const gdb = sb.goalsFor - sb.goalsAgainst
    if (gdb !== gda) return gdb - gda
    if (sb.goalsFor !== sa.goalsFor) return sb.goalsFor - sa.goalsFor
    return byRank(a, b)
  }
}

const RUNNERUP_POOL = 4 // 대륙간 PO 미니토너먼트에 오르는 최고 2위 팀 수(실제 2026 CAF)

/**
 * CAF 예선 (B15 — 실제 2026 아프리카 예선 구조). 9개 조 홈&어웨이 → 각 조 1위 직행(9장) →
 * 조 2위 중 성적 최고 4팀이 미니토너먼트(준결승·결승 단판 녹아웃, 중립지)를 벌여 승자 1팀이
 * 대륙간 플레이오프에 진출한다.
 * 총 9 직행 + 1 대륙간 PO로 슬롯을 정확히 지킨다.
 */
export function simulateCaf(
  teams: string[],
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
  locked?: LockedLookup,
  directSlots: number = SLOT_ALLOCATION.CAF.direct,
): QualificationResult {
  const fmt = QUAL_FORMAT.CAF as GroupsFormat
  const sorted = [...teams].sort(byRank)
  const groups = snakeSeed(sorted, fmt.numGroups)

  const allMatches: QualMatch[] = []
  const groupRankings: string[][] = []
  const groupLabels: string[] = []
  let md = 0

  // --- 조별리그: 9개 조 동시 진행 → 1위 직행, 2위는 대륙간 PO 후보 ---
  const winners: string[] = []
  const runnersUp: string[] = []
  groups.forEach((g, gi) => {
    const { matches, ranking, lastMatchday } = playSingleGroup(g, ratings, rand, {
      doubleRound: fmt.doubleRound,
      groupIndex: groupRankings.length,
      locked,
    })
    allMatches.push(...matches)
    groupRankings.push(ranking)
    groupLabels.push(`${GROUP_LETTERS[gi]}조`)
    md = Math.max(md, lastMatchday)
    if (ranking[0]) winners.push(ranking[0])
    if (ranking[1]) runnersUp.push(ranking[1])
  })

  // --- 최고 2위 4팀 미니토너먼트: 준결승 1v4·2v3 → 결승 → 승자 대륙간 PO행 ---
  const overall = computeStandings(teams, allMatches)
  const rec = byRecord(overall)
  const pool = [...runnersUp].sort(rec).slice(0, RUNNERUP_POOL)
  const seedIndex = new Map(pool.map((id, i) => [id, i]))

  const playKnockout = (a: string, b: string, mdNum: number, groupIdx: number): string => {
    const lk = locked?.(a, b, mdNum, groupIdx)
    const s = lk ?? simulateScoreRaw(ratings[a], ratings[b], 0, 0, rand) // 중립지 단판
    allMatches.push({ homeTeamId: a, awayTeamId: b, homeGoals: s.homeGoals, awayGoals: s.awayGoals, matchday: mdNum, group: groupIdx })
    return s.homeGoals >= s.awayGoals ? a : b // 무승부면 상위 시드 진출(결정성)
  }

  const playoff: string[] = []
  if (pool.length >= RUNNERUP_POOL) {
    const gIdx = groupRankings.length
    const sfMd = md + 1
    const finalMd = md + 2
    const [s1, s2, s3, s4] = pool
    const w1 = playKnockout(s1, s4, sfMd, gIdx)
    const w2 = playKnockout(s2, s3, sfMd, gIdx)
    const finalHome = (seedIndex.get(w1) ?? 0) <= (seedIndex.get(w2) ?? 0) ? w1 : w2
    const finalAway = finalHome === w1 ? w2 : w1
    const champ = playKnockout(finalHome, finalAway, finalMd, gIdx)
    playoff.push(champ)
    const finalLoser = champ === finalHome ? finalAway : finalHome
    const sfLosers = pool.filter((t) => t !== w1 && t !== w2).sort(rec)
    groupRankings.push([champ, finalLoser, ...sfLosers])
    groupLabels.push('최고 2위 PO')
    md = Math.max(md, finalMd)
  } else if (pool.length > 0) {
    playoff.push([...pool].sort(rec)[0])
  }

  // 최종: 조 1위 직행 + (대륙간 PO행은 playoff로 분리)
  const qualified = winners.slice(0, directSlots)
  const picked = new Set([...qualified, ...playoff])
  const rest = sorted.filter((id) => !picked.has(id))
  const standings = [...qualified, ...playoff, ...rest]

  return {
    confederation: 'CAF',
    standings,
    groups: groupRankings,
    groupLabels,
    qualified,
    playoff,
    matches: allMatches,
    matchdays: md,
  }
}
