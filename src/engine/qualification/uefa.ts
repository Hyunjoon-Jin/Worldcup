import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { QUALIFIER_HOME_ADVANTAGE } from '../config'
import { simulateScoreRaw, type RandomFn } from '../matchCore'
import { computeStandings } from '../tiebreakers'
import { playSingleGroup, snakeSeed, seedComparator, type LockedLookup } from './generic'
import { QUAL_FORMAT, GROUP_LETTERS, type GroupsFormat } from './formats'
import type { GroupStanding } from '../../types/group'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult, QualMatch } from '../../types/qualification'

const byRank = (a: string, b: string) => {
  const rd = ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox
  return rd !== 0 ? rd : a.localeCompare(b) // 랭킹 동률 시 팀ID로 결정성 확보
}

/** 예선 전체 성적(승점 → 골득실 → 다득점 → 랭킹) 비교. 2위·3위 시딩과 경로 배정에 쓴다. */
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

const PLAYOFF_PATHS = 4 // 4개 경로 → 4장 (실제 UEFA 플레이오프)

/**
 * UEFA 예선 (B14 — 실제 2026 유럽 예선 구조). 12개 조 홈&어웨이 → 각 조 1위 직행(12장) →
 * 나머지 4장은 플레이오프로 결정한다.
 * - 조별리그: 12개 조(4~5팀) 더블 라운드로빈. 각 조 1위 본선 직행.
 * - 플레이오프: 16팀(12개 조 2위 + 조별 성적 최고 3위 4팀 — 실제 규정의 네이션스리그 경로 대체)이
 *   4개 경로로 나뉘어 준결승·결승 단판 녹아웃. 각 경로 승자 1팀씩 본선 직행(4장).
 * 총 12 + 4 = 16 직행, 대륙간 PO 없음(UEFA는 대륙간 PO 슬롯이 없다).
 */
export function simulateUefa(
  teams: string[],
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
  locked?: LockedLookup,
  directSlots: number = SLOT_ALLOCATION.UEFA.direct,
  seedRank?: Record<string, number>,
): QualificationResult {
  const fmt = QUAL_FORMAT.UEFA as GroupsFormat
  const sorted = [...teams].sort(seedComparator(seedRank)) // 시드는 이월 FIFA 순위순(성적 반영)
  const groups = snakeSeed(sorted, fmt.numGroups)

  const allMatches: QualMatch[] = []
  const groupRankings: string[][] = []
  const groupLabels: string[] = []
  let md = 0

  // --- 조별리그: 12개 조 동시 진행 → 1위 직행, 2위·3위는 플레이오프 후보 ---
  const winners: string[] = []
  const runnersUp: string[] = []
  const thirds: string[] = []
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
    if (ranking[2]) thirds.push(ranking[2])
  })

  // --- 플레이오프 후보 16팀: 조 2위 전원 + 조별 성적 최고 3위 4팀 ---
  // D26 공정화: 조 크기가 다르면(5팀 vs 4팀) 큰 조 최하위 팀과의 경기를 제외해 (최소 조 크기−1)경기로
  // 맞춘 뒤 3위 선발·플레이오프 시딩을 비교한다(조별 1위 직행은 각 조 자체 순위라 영향 없음).
  const minGroupSize = Math.min(...groupRankings.map((g) => g.length))
  const excludedForRank = new Set<string>()
  for (const g of groupRankings) for (const t of g.slice(minGroupSize)) excludedForRank.add(t)
  const equalizedMatches = excludedForRank.size
    ? allMatches.filter((m) => !excludedForRank.has(m.homeTeamId) && !excludedForRank.has(m.awayTeamId))
    : allMatches
  const overall = computeStandings(teams, equalizedMatches)
  const rec = byRecord(overall)
  const bestThirds = [...thirds].sort(rec).slice(0, PLAYOFF_PATHS)
  const poPool = [...runnersUp, ...bestThirds]
  const poSeeded = [...poPool].sort(rec) // 성적 상위가 1번 시드

  // 단판 녹아웃: 상위 시드(a)가 홈. 무승부면 상위 시드 진출(결정성).
  const playKnockout = (a: string, b: string, mdNum: number, groupIdx: number): string => {
    const lk = locked?.(a, b, mdNum, groupIdx)
    const s = lk ?? simulateScoreRaw(ratings[a], ratings[b], QUALIFIER_HOME_ADVANTAGE, 0, rand)
    allMatches.push({ homeTeamId: a, awayTeamId: b, homeGoals: s.homeGoals, awayGoals: s.awayGoals, matchday: mdNum, group: groupIdx })
    return s.homeGoals >= s.awayGoals ? a : b
  }

  // --- 플레이오프: 4개 경로 × (준결승 2 + 결승 1) → 경로 승자 4팀 직행 ---
  const playoffWinners: string[] = []
  const sfMd = md + 1
  const finalMd = md + 2
  const seedIndex = new Map(poSeeded.map((id, i) => [id, i])) // 결승 홈 결정(더 높은 시드가 홈)
  for (let p = 0; p < PLAYOFF_PATHS; p++) {
    // 경로 p 시드: [p, p+4, p+8, p+12] (1·2·3·4번 시드). 준결승 1v4·2v3, 결승 승자끼리.
    const path = [poSeeded[p], poSeeded[p + PLAYOFF_PATHS], poSeeded[p + 2 * PLAYOFF_PATHS], poSeeded[p + 3 * PLAYOFF_PATHS]].filter(Boolean)
    const gIdx = groupRankings.length
    if (path.length < 4) {
      // 후보 부족(개최국 다수 등 예외) — 존재하는 팀 중 최상위 시드를 진출 처리.
      const w = [...path].sort(rec)[0]
      if (w) {
        playoffWinners.push(w)
        groupRankings.push([...path].sort(rec))
        groupLabels.push(`PO 경로 ${GROUP_LETTERS[p]}`)
      }
      continue
    }
    const [s1, s2, s3, s4] = path
    const w1 = playKnockout(s1, s4, sfMd, gIdx)
    const w2 = playKnockout(s2, s3, sfMd, gIdx)
    const finalHome = (seedIndex.get(w1) ?? 0) <= (seedIndex.get(w2) ?? 0) ? w1 : w2
    const finalAway = finalHome === w1 ? w2 : w1
    const champ = playKnockout(finalHome, finalAway, finalMd, gIdx)
    playoffWinners.push(champ)
    // 표시용 경로 순위: 승자 → 결승 패자 → 준결승 탈락 2팀(성적순)
    const finalLoser = champ === finalHome ? finalAway : finalHome
    const sfLosers = path.filter((t) => t !== w1 && t !== w2).sort(rec)
    groupRankings.push([champ, finalLoser, ...sfLosers])
    groupLabels.push(`PO 경로 ${GROUP_LETTERS[p]}`)
  }
  md = Math.max(md, finalMd)

  // 최종: 조 1위(직행) + 플레이오프 승자 = 16장. 대륙간 PO는 없음.
  const qualified = [...winners, ...playoffWinners].slice(0, directSlots)
  const picked = new Set(qualified)
  const rest = sorted.filter((id) => !picked.has(id))
  const standings = [...qualified, ...rest]

  return {
    confederation: 'UEFA',
    standings,
    groups: groupRankings,
    groupLabels,
    qualified,
    playoff: [],
    matches: allMatches,
    matchdays: md,
  }
}
