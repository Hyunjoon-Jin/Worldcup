import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { type RandomFn } from '../matchCore'
import { playSingleGroup, snakeSeed, rankAcrossGroups, type LockedLookup } from './generic'
import { QUAL_FORMAT, GROUP_LETTERS, type ConcacafFormat } from './formats'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult, QualMatch } from '../../types/qualification'

const byRank = (a: string, b: string) => {
  const rd = ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox
  return rd !== 0 ? rd : a.localeCompare(b) // 랭킹 동률 시 팀ID로 결정성 확보
}

/**
 * CONCACAF 다라운드 예선 근사 (A4). 개최국은 상위(오케스트레이터)에서 이미 제외되어 들어온다.
 * - 1차 예선 라운드: 하위권 팀들이 미니 조에서 경쟁 → 상위 2팀만 최종 라운드 진출.
 * - 최종 라운드: 3개 조 홈&어웨이 → 각 조 1위 본선 직행(directSlots), 최고 2위 2팀은 대륙간 PO행.
 * directSlots는 개최국 수를 뺀 값이 오케스트레이터에서 전달된다(기본 3).
 */
export function simulateConcacaf(
  teams: string[],
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
  locked?: LockedLookup,
  directSlots: number = SLOT_ALLOCATION.CONCACAF.direct - 3,
): QualificationResult {
  const fmt = QUAL_FORMAT.CONCACAF as ConcacafFormat
  const pool = teams // 개최국은 이미 제외됨
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
      locked,
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
  const finalGroupRankings: string[][] = []
  const finalGroupMatches: QualMatch[] = []
  snakeSeed([...finalists].sort(byRank), numFinalGroups).forEach((g, i) => {
    const { matches, ranking, lastMatchday } = playSingleGroup(g, ratings, rand, {
      doubleRound: true,
      groupIndex: groupRankings.length,
      matchdayOffset: finalBase,
      locked,
    })
    allMatches.push(...matches)
    finalGroupMatches.push(...matches)
    groupRankings.push(ranking)
    finalGroupRankings.push(ranking)
    groupLabels.push(`최종 ${GROUP_LETTERS[i]}조`)
    md = Math.max(md, lastMatchday)
  })

  // 최종 라운드 전체 순위로 직행/PO를 가른다(개최국이 CONCACAF 밖이면 directSlots가 커져도 유연).
  const finalOrder = rankAcrossGroups(finalGroupRankings, finalGroupMatches, finalists)
  const qualified = finalOrder.slice(0, directSlots)
  const playoff = finalOrder.slice(directSlots, directSlots + playoffSlots)
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
