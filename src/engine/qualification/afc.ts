import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { simulateScoreRaw, type RandomFn } from '../matchCore'
import { playSingleGroup, snakeSeed, type LockedLookup } from './generic'
import { QUAL_FORMAT, GROUP_LETTERS, type AfcFormat } from './formats'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult, QualMatch } from '../../types/qualification'

const byRank = (a: string, b: string) => {
  const rd = ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox
  return rd !== 0 ? rd : a.localeCompare(b) // 랭킹 동률 시 팀ID로 결정성 확보
}

/**
 * AFC 다단계 예선 (A3 · 1·2차 예비예선 포함). 실제 2026 아시아 예선 5라운드 구조를 재현한다.
 * - 1차 예선: 하위 팀들이 단판 녹아웃 → 필드를 2차 규모(round2Groups×4=36)로 줄인다.
 * - 2차 예선: round2Groups개 조(각 4팀) 홈&어웨이 → 각 조 1·2위가 3차로(= round2Groups×2=18).
 * - 3차: round3Groups개 조(각 6팀) → 각 조 1·2위 본선 직행(6장), 3·4위는 4차로.
 * - 4차: round4Groups개 조 → 각 조 1위 본선 직행(2장, 누적 8장), 2위는 5차로.
 * - 5차: 두 조 2위 단판 PO → 승자가 대륙간 플레이오프행(1장).
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

  const ROUND2_SIZE = fmt.round2Groups * 4 // 2차 참가 팀 수(9×4=36)
  const ROUND3_SIZE = fmt.round2Groups * 2 // 3차 진입 팀 수(9×2=18)

  /** 한 조를 치르고 등록한다. 같은 스테이지 조들은 base(matchdayOffset)를 공유해 병행한다. */
  const runGroup = (g: string[], label: string, base: number, doubleRound = fmt.doubleRound): string[] => {
    const { matches, ranking, lastMatchday } = playSingleGroup(g, ratings, rand, {
      doubleRound,
      groupIndex: groupRankings.length,
      matchdayOffset: base,
      locked,
    })
    allMatches.push(...matches)
    groupRankings.push(ranking)
    groupLabels.push(label)
    md = Math.max(md, lastMatchday)
    return ranking
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
      const a = play[i] // 상위 시드(홈)
      const b = play[play.length - 1 - i] // 하위 시드
      const lk = locked?.(a, b, r1Md, groupRankings.length)
      const s = lk ?? simulateScoreRaw(ratings[a], ratings[b], 0, 0, rand)
      const winner = s.homeGoals >= s.awayGoals ? a : b // 단판: 무승부면 상위 시드 진출
      allMatches.push({ homeTeamId: a, awayTeamId: b, homeGoals: s.homeGoals, awayGoals: s.awayGoals, matchday: r1Md, group: groupRankings.length })
      winners.push(winner)
    }
    // 녹아웃은 조가 아니지만 표시 일관성을 위해 통과팀 목록을 하나의 "그룹"으로 등록한다.
    groupRankings.push([...winners].sort(byRank))
    groupLabels.push('1차 예선')
    round2Field = [...byes, ...winners].sort(byRank)
  } else {
    round2Field = sorted
  }

  // --- 2차 예선: round2Groups개 조(각 4팀) → 각 조 1·2위가 3차로 ---
  const r2Base = md
  const round3Field: string[] = []
  snakeSeed(round2Field, fmt.round2Groups).forEach((g, i) => {
    const ranking = runGroup(g, `2차 ${GROUP_LETTERS[i]}조`, r2Base)
    if (ranking[0]) round3Field.push(ranking[0])
    if (ranking[1]) round3Field.push(ranking[1])
  })

  // --- 3차: round3Groups개 조(각 6팀) → 1·2위 직행, 3·4위 4차로 ---
  const direct: string[] = []
  const round4Pool: string[] = []
  const r3Base = md
  snakeSeed([...round3Field].slice(0, ROUND3_SIZE).sort(byRank), fmt.round3Groups).forEach((g, i) => {
    const ranking = runGroup(g, `3차 ${GROUP_LETTERS[i]}조`, r3Base)
    if (ranking[0]) direct.push(ranking[0])
    if (ranking[1]) direct.push(ranking[1])
    if (ranking[2]) round4Pool.push(ranking[2])
    if (ranking[3]) round4Pool.push(ranking[3])
  })

  // --- 4차: 3·4위 팀들을 round4Groups개 조로 → 1위 직행, 2위 5차로 ---
  // 4차는 중립지 단판 라운드로빈(B9): 실제 2026 4차와 동일하게 홈&어웨이가 아니다.
  const round5Pool: string[] = []
  const r4Base = md
  snakeSeed([...round4Pool].sort(byRank), fmt.round4Groups).forEach((g, i) => {
    const ranking = runGroup(g, `4차 ${GROUP_LETTERS[i]}조`, r4Base, false)
    if (ranking[0]) direct.push(ranking[0])
    if (ranking[1]) round5Pool.push(ranking[1])
  })

  // --- 5차: 두 조 2위 홈&어웨이 2연전 → 합산 승자 대륙간 PO행(B10) ---
  const playoff: string[] = []
  if (round5Pool.length >= 2) {
    const [a, b] = [...round5Pool].sort(byRank)
    // 1차전: a 홈, 2차전: b 홈
    md += 1
    const md1 = md
    const lk1 = locked?.(a, b, md1, groupRankings.length)
    const s1 = lk1 ?? simulateScoreRaw(ratings[a], ratings[b], 0, 0, rand)
    allMatches.push({ homeTeamId: a, awayTeamId: b, homeGoals: s1.homeGoals, awayGoals: s1.awayGoals, matchday: md1, group: groupRankings.length })
    md += 1
    const md2 = md
    const lk2 = locked?.(b, a, md2, groupRankings.length)
    const s2 = lk2 ?? simulateScoreRaw(ratings[b], ratings[a], 0, 0, rand)
    allMatches.push({ homeTeamId: b, awayTeamId: a, homeGoals: s2.homeGoals, awayGoals: s2.awayGoals, matchday: md2, group: groupRankings.length })
    // 합산: a 득점 = 1차전 홈 + 2차전 원정, b 득점 = 1차전 원정 + 2차전 홈. 동점이면 상위 시드(a).
    const aggA = s1.homeGoals + s2.awayGoals
    const aggB = s1.awayGoals + s2.homeGoals
    const winner = aggA >= aggB ? a : b
    groupRankings.push([winner, winner === a ? b : a])
    groupLabels.push('5차 PO(2연전)')
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
