import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { simulateScoreRaw, type RandomFn } from '../matchCore'
import { playSingleGroup, snakeSeed, type LockedLookup } from './generic'
import { QUAL_FORMAT, GROUP_LETTERS, type AfcFormat } from './formats'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult, QualMatch } from '../../types/qualification'

const byRank = (a: string, b: string) =>
  ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox

/**
 * AFC 다단계 예선 근사 (A3). 실제 3차~5차 라운드 구조를 재현한다.
 * - 3차: 3개 조 홈&어웨이 → 각 조 1·2위 본선 직행(6장), 3·4위는 4차로.
 * - 4차: 3·4위 6팀을 2개 조로 → 각 조 1위 본선 직행(2장, 누적 8장), 2위는 5차로.
 * - 5차: 두 조 2위가 플레이오프 → 승자가 대륙간 플레이오프행(1장).
 * 총 8 직행 + 1 대륙간 PO로 슬롯을 정확히 지킨다.
 */
export function simulateAfc(
  teams: string[],
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
  locked?: LockedLookup,
  directSlots: number = SLOT_ALLOCATION.AFC.direct,
): QualificationResult {
  const fmt = QUAL_FORMAT.AFC as AfcFormat
  const sorted = [...teams].sort(byRank)

  const allMatches: QualMatch[] = []
  const groupRankings: string[][] = []
  const groupLabels: string[] = []
  let md = 0

  const direct: string[] = []
  const round4Pool: string[] = []

  // 3차: N개 조 (같은 스테이지 조들은 동일 매치데이 창에서 병행 → 고정 base 사용)
  const r3Base = md
  snakeSeed(sorted, fmt.round3Groups).forEach((g, i) => {
    const { matches, ranking, lastMatchday } = playSingleGroup(g, ratings, rand, {
      doubleRound: fmt.doubleRound,
      groupIndex: groupRankings.length,
      matchdayOffset: r3Base,
      locked,
    })
    allMatches.push(...matches)
    groupRankings.push(ranking)
    groupLabels.push(`3차 ${GROUP_LETTERS[i]}조`)
    md = Math.max(md, lastMatchday)
    if (ranking[0]) direct.push(ranking[0])
    if (ranking[1]) direct.push(ranking[1])
    if (ranking[2]) round4Pool.push(ranking[2])
    if (ranking[3]) round4Pool.push(ranking[3])
  })

  // 4차: 3·4위 팀들을 N개 조로 (3차 종료 후 시작 → 고정 base)
  const round5Pool: string[] = []
  const r4Base = md
  snakeSeed([...round4Pool].sort(byRank), fmt.round4Groups).forEach((g, i) => {
    const { matches, ranking, lastMatchday } = playSingleGroup(g, ratings, rand, {
      doubleRound: fmt.doubleRound,
      groupIndex: groupRankings.length,
      matchdayOffset: r4Base,
      locked,
    })
    allMatches.push(...matches)
    groupRankings.push(ranking)
    groupLabels.push(`4차 ${GROUP_LETTERS[i]}조`)
    md = Math.max(md, lastMatchday)
    if (ranking[0]) direct.push(ranking[0])
    if (ranking[1]) round5Pool.push(ranking[1])
  })

  // 5차: 두 조 2위 단판 플레이오프 → 승자 대륙간 PO행
  const playoff: string[] = []
  if (round5Pool.length >= 2) {
    const [a, b] = [...round5Pool].sort(byRank)
    md += 1
    const lk = locked?.(a, b, md, groupRankings.length)
    const s = lk ?? simulateScoreRaw(ratings[a], ratings[b], 0, 0, rand)
    // 단판: 무승부면 시드(랭킹 상위 a)가 진출
    const winner = s.homeGoals >= s.awayGoals ? a : b
    allMatches.push({ homeTeamId: a, awayTeamId: b, homeGoals: s.homeGoals, awayGoals: s.awayGoals, matchday: md, group: groupRankings.length })
    groupRankings.push([winner, winner === a ? b : a])
    groupLabels.push('5차 PO')
    playoff.push(winner)
  } else if (round5Pool.length === 1) {
    playoff.push(round5Pool[0])
  }

  // 최종 순위: 직행 → 대륙간 PO → 나머지(랭킹순)
  const qualified = direct.slice(0, directSlots)
  const picked = new Set([...qualified, ...playoff])
  const rest = sorted.filter((id) => !picked.has(id))
  const standings = [...qualified, ...playoff, ...rest]

  return {
    confederation: 'AFC',
    standings,
    groups: groupRankings,
    groupLabels,
    qualified,
    playoff,
    matches: allMatches,
    matchdays: md,
  }
}
