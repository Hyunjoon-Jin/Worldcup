import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { simulateScoreRaw, type RandomFn } from '../matchCore'
import { playSingleGroup, snakeSeed, rankAcrossGroups, type LockedLookup } from './generic'
import { QUAL_FORMAT, GROUP_LETTERS, type ConcacafFormat } from './formats'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult, QualMatch } from '../../types/qualification'

const byRank = (a: string, b: string) => {
  const rd = ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox
  return rd !== 0 ? rd : a.localeCompare(b) // 랭킹 동률 시 팀ID로 결정성 확보
}

/**
 * CONCACAF 다라운드 예선 (A4 · 1·2차 예비예선 포함). 개최국은 상위(오케스트레이터)에서 이미 제외되어 들어온다.
 * - 1차 예선: 하위 팀들이 단판 녹아웃 → 필드를 2차 규모(round2Groups×4)로 줄인다.
 * - 2차 예선: round2Groups개 조(각 4팀) 홈&어웨이 → 각 조 1·2위가 최종 라운드로(= round2Groups×2).
 * - 최종 라운드: finalGroups개 조(각 4팀) 홈&어웨이 → 각 조 1위 본선 직행(directSlots), 최고 2위 2팀은 대륙간 PO행.
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

  const ROUND2_SIZE = fmt.round2Groups * 4 // 2차 참가 팀 수(6×4=24)

  /** 한 조를 치르고 등록한다. 같은 스테이지 조들은 base를 공유해 병행한다. */
  const runGroup = (g: string[], label: string, base: number, keep: (r: string[]) => void): void => {
    const { matches, ranking, lastMatchday } = playSingleGroup(g, ratings, rand, {
      doubleRound: true,
      groupIndex: groupRankings.length,
      matchdayOffset: base,
      locked,
    })
    allMatches.push(...matches)
    groupRankings.push(ranking)
    groupLabels.push(label)
    md = Math.max(md, lastMatchday)
    keep(ranking)
  }

  // --- 1차 예선: 하위 팀 단판 녹아웃으로 필드를 ROUND2_SIZE로 줄인다 ---
  let round2Field: string[]
  const cut = Math.max(0, Math.min(sorted.length - ROUND2_SIZE, Math.floor(sorted.length / 2)))
  if (cut > 0) {
    const byes = sorted.slice(0, sorted.length - 2 * cut)
    const play = sorted.slice(sorted.length - 2 * cut)
    md += 1
    const r1Md = md
    const winners: string[] = []
    for (let i = 0; i < cut; i++) {
      const a = play[i]
      const b = play[play.length - 1 - i]
      const lk = locked?.(a, b, r1Md, groupRankings.length)
      const s = lk ?? simulateScoreRaw(ratings[a], ratings[b], 0, 0, rand)
      const winner = s.homeGoals >= s.awayGoals ? a : b
      allMatches.push({ homeTeamId: a, awayTeamId: b, homeGoals: s.homeGoals, awayGoals: s.awayGoals, matchday: r1Md, group: groupRankings.length })
      winners.push(winner)
    }
    groupRankings.push([...winners].sort(byRank))
    groupLabels.push('1차 예선')
    round2Field = [...byes, ...winners].sort(byRank)
  } else {
    round2Field = sorted
  }

  // --- 2차 예선: round2Groups개 조(각 4팀) → 각 조 1·2위가 최종 라운드로 ---
  const r2Base = md
  const finalists: string[] = []
  snakeSeed(round2Field, fmt.round2Groups).forEach((g, i) => {
    runGroup(g, `2차 ${GROUP_LETTERS[i]}조`, r2Base, (ranking) => {
      if (ranking[0]) finalists.push(ranking[0])
      if (ranking[1]) finalists.push(ranking[1])
    })
  })

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
