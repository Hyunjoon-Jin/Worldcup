import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { HOST_SLOTS } from '../../data/hostSlots'
import { computeStandings } from '../tiebreakers'
import { type RandomFn } from '../matchCore'
import { playSingleGroup, snakeSeed } from './generic'
import { QUAL_FORMAT, GROUP_LETTERS, type ConcacafFormat } from './formats'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult, QualMatch } from '../../types/qualification'

const HOST_IDS = Object.keys(HOST_SLOTS)
const byRank = (a: string, b: string) =>
  ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox

/**
 * CONCACAF 다라운드 예선 근사 (A4). 개최 3국(멕시코·미국·캐나다)은 자동 진출이라 제외한 풀로 진행.
 * - 1차 예선 라운드: 하위권 팀들이 미니 조에서 경쟁 → 상위 2팀만 최종 라운드 진출.
 * - 최종 라운드: 3개 조 홈&어웨이 → 각 조 1위 본선 직행(3장), 최고 2위 2팀은 대륙간 PO행(2장).
 * 총 3 직행 + 2 대륙간 PO(개최국 제외 기준)로 슬롯을 정확히 지킨다.
 */
export function simulateConcacaf(
  teams: string[],
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
): QualificationResult {
  const fmt = QUAL_FORMAT.CONCACAF as ConcacafFormat
  const pool = teams.filter((id) => !HOST_IDS.includes(id))
  const directSlots = SLOT_ALLOCATION.CONCACAF.direct - HOST_IDS.length // 3
  const playoffSlots = SLOT_ALLOCATION.CONCACAF.playoff // 2
  const sorted = [...pool].sort(byRank)

  const allMatches: QualMatch[] = []
  const groupRankings: string[][] = []
  const groupLabels: string[] = []
  let md = 0

  // 최종 라운드(예: 3개 조 × 3팀 = 9팀). 상위 시드는 최종 라운드 직행, 하위권은 1차를 거친다.
  const FINAL_SIZE = fmt.finalSize
  const prelimSurvivors = Math.min(fmt.prelimSurvivors, Math.max(0, pool.length - (FINAL_SIZE - fmt.prelimSurvivors)))

  let finalists: string[]
  if (pool.length <= FINAL_SIZE) {
    // 팀이 적으면 1차 없이 전원 최종 라운드
    finalists = sorted
  } else {
    const autoIntoFinal = sorted.slice(0, FINAL_SIZE - prelimSurvivors)
    const prelimTeams = sorted.slice(FINAL_SIZE - prelimSurvivors)
    // 1차: 단일 조 라운드로빈 → 상위 prelimSurvivors 진출
    const { matches, ranking, lastMatchday } = playSingleGroup(prelimTeams, ratings, rand, {
      doubleRound: false,
      groupIndex: 0,
      matchdayOffset: md,
    })
    allMatches.push(...matches)
    groupRankings.push(ranking)
    groupLabels.push('1차 예선 라운드')
    md = Math.max(md, lastMatchday)
    finalists = [...autoIntoFinal, ...ranking.slice(0, prelimSurvivors)]
  }

  // 최종 라운드: N개 조
  const finalBase = md
  const numFinalGroups = Math.min(fmt.finalGroups, finalists.length)
  const direct: string[] = []
  const runnersUp: string[] = []
  const finalGroupMatches: QualMatch[] = []
  snakeSeed([...finalists].sort(byRank), numFinalGroups).forEach((g, i) => {
    const { matches, ranking, lastMatchday } = playSingleGroup(g, ratings, rand, {
      doubleRound: true,
      groupIndex: groupRankings.length,
      matchdayOffset: finalBase,
    })
    allMatches.push(...matches)
    finalGroupMatches.push(...matches)
    groupRankings.push(ranking)
    groupLabels.push(`최종 ${GROUP_LETTERS[i]}조`)
    md = Math.max(md, lastMatchday)
    if (ranking[0]) direct.push(ranking[0])
    if (ranking[1]) runnersUp.push(ranking[1])
  })

  // 최고 2위: 최종 라운드 성적으로 조 2위끼리 비교해 상위 playoffSlots팀을 PO행으로.
  const ruStand = computeStandings(runnersUp, finalGroupMatches)
  const playoff = [...runnersUp]
    .sort((a, b) => {
      const sa = ruStand[a]
      const sb = ruStand[b]
      if (sb.points !== sa.points) return sb.points - sa.points
      const gda = sa.goalsFor - sa.goalsAgainst
      const gdb = sb.goalsFor - sb.goalsAgainst
      if (gdb !== gda) return gdb - gda
      return byRank(a, b)
    })
    .slice(0, playoffSlots)

  const qualified = direct.slice(0, directSlots)
  const picked = new Set([...qualified, ...playoff])
  const rest = sorted.filter((id) => !picked.has(id))
  const standings = [...qualified, ...playoff, ...rest]

  return {
    confederation: 'CONCACAF',
    standings,
    groups: groupRankings,
    groupLabels,
    qualified,
    playoff,
    matches: allMatches,
    matchdays: md,
  }
}
