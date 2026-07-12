import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { QUALIFIER_HOME_ADVANTAGE } from '../config'
import { simulateScoreRaw, type RandomFn } from '../matchCore'
import { computeStandings, rankGroupTeams } from '../tiebreakers'
import type { MatchResult } from '../../types/match'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult } from '../../types/qualification'

export interface QualConfig {
  confederation: string
  /** 조 수(1이면 단일리그) */
  numGroups: number
  /** 본선 직행 슬롯 */
  direct: number
  /** 대륙간 PO행 슬롯 */
  playoff: number
  /** 조 내 홈&어웨이(2경기)면 true, 단판이면 false */
  doubleRound?: boolean
}

/** 실력(랭킹) 순으로 뱀 배정(serpentine)해 조를 균형 있게 나눈다. */
function snakeSeed(sorted: string[], numGroups: number): string[][] {
  const groups: string[][] = Array.from({ length: numGroups }, () => [])
  let g = 0
  let dir = 1
  for (const t of sorted) {
    groups[g].push(t)
    if (dir === 1) {
      if (g === numGroups - 1) dir = -1
      else g++
    } else {
      if (g === 0) dir = 1
      else g--
    }
  }
  return groups
}

/**
 * 범용 조별 예선 (지역예선 Q2). 조 분할 → 조별 라운드로빈 → 조별 순위 → 같은 순위 팀들을
 * 전체 기록으로 횡단 비교해 글로벌 순위를 만든 뒤, 상위 direct 직행 + 다음 playoff를 PO로 보낸다.
 * numGroups=1이면 단일리그(CONMEBOL·OFC)와 동일하게 동작한다.
 */
export function simulateGroupQualification(
  teams: string[],
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
  cfg: QualConfig,
): QualificationResult {
  const sorted = [...teams].sort(
    (a, b) => ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox,
  )
  const groups = snakeSeed(sorted, cfg.numGroups)
  const matches: MatchResult[] = []
  const groupRankings: string[][] = []

  for (const g of groups) {
    const gm: MatchResult[] = []
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        const legs: Array<[string, string]> = cfg.doubleRound
          ? [
              [g[i], g[j]],
              [g[j], g[i]],
            ]
          : [[g[i], g[j]]]
        for (const [home, away] of legs) {
          const s = simulateScoreRaw(ratings[home], ratings[away], QUALIFIER_HOME_ADVANTAGE, 0, rand)
          const m: MatchResult = { homeTeamId: home, awayTeamId: away, homeGoals: s.homeGoals, awayGoals: s.awayGoals }
          gm.push(m)
          matches.push(m)
        }
      }
    }
    groupRankings.push(rankGroupTeams(g, gm))
  }

  const overall = computeStandings(teams, matches)
  const byRecord = (a: string, b: string) => {
    const sa = overall[a]
    const sb = overall[b]
    if (sb.points !== sa.points) return sb.points - sa.points
    const gda = sa.goalsFor - sa.goalsAgainst
    const gdb = sb.goalsFor - sb.goalsAgainst
    if (gdb !== gda) return gdb - gda
    if (sb.goalsFor !== sa.goalsFor) return sb.goalsFor - sa.goalsFor
    return ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox
  }

  // 같은 조내 순위(1위끼리, 2위끼리 …)를 전체 기록으로 횡단 비교해 글로벌 순위를 만든다.
  const maxLen = Math.max(...groupRankings.map((r) => r.length))
  const standings: string[] = []
  for (let pos = 0; pos < maxLen; pos++) {
    const atPos = groupRankings.map((r) => r[pos]).filter(Boolean) as string[]
    atPos.sort(byRecord)
    standings.push(...atPos)
  }

  return {
    confederation: cfg.confederation,
    standings,
    groups: groupRankings,
    qualified: standings.slice(0, cfg.direct),
    playoff: standings.slice(cfg.direct, cfg.direct + cfg.playoff),
    matches,
  }
}
