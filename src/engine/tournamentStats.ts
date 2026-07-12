import type { GroupMatch, KnockoutMatch } from '../types/match'

/** 통계 계산용으로 조별·토너먼트 경기를 공통 형태로 표준화한 것. */
export interface StatMatch {
  homeTeamId: string
  awayTeamId: string
  homeGoals: number
  awayGoals: number
  label: string
  wentToPenalties: boolean
}

export interface TournamentStats {
  totalMatches: number
  totalGoals: number
  avgGoalsPerMatch: number
  penaltyShootouts: number
  biggestWin: StatMatch | null
  highestScoring: StatMatch | null
  /** 다득점 팀 상위 목록 */
  topScorers: { teamId: string; goals: number }[]
  /** 최소 실점(무실점 경기 수 기준) 팀 상위 목록 */
  bestDefense: { teamId: string; cleanSheets: number; conceded: number }[]
}

const KO_ROUND_LABEL: Record<string, string> = {
  R32: '32강',
  R16: '16강',
  QF: '8강',
  SF: '4강',
  THIRD: '3·4위전',
  FINAL: '결승',
}

/** 확정된 조별/토너먼트 경기를 통계용 StatMatch 목록으로 변환한다. */
export function toStatMatches(groupMatches: GroupMatch[], knockoutMatches: KnockoutMatch[]): StatMatch[] {
  const group = groupMatches.map((m) => ({
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    label: `조별 MD${m.matchday} · 조 ${m.group}`,
    wentToPenalties: false,
  }))
  const ko = knockoutMatches.map((m) => ({
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    label: KO_ROUND_LABEL[m.round] ?? m.round,
    wentToPenalties: m.wentToPenalties,
  }))
  return [...group, ...ko]
}

export function computeTournamentStats(matches: StatMatch[]): TournamentStats {
  const goalsFor: Record<string, number> = {}
  const conceded: Record<string, number> = {}
  const cleanSheets: Record<string, number> = {}
  let totalGoals = 0
  let penaltyShootouts = 0
  let biggestWin: StatMatch | null = null
  let highestScoring: StatMatch | null = null

  const add = (acc: Record<string, number>, id: string, n: number) => {
    acc[id] = (acc[id] ?? 0) + n
  }

  for (const m of matches) {
    totalGoals += m.homeGoals + m.awayGoals
    if (m.wentToPenalties) penaltyShootouts += 1
    add(goalsFor, m.homeTeamId, m.homeGoals)
    add(goalsFor, m.awayTeamId, m.awayGoals)
    add(conceded, m.homeTeamId, m.awayGoals)
    add(conceded, m.awayTeamId, m.homeGoals)
    if (m.awayGoals === 0) add(cleanSheets, m.homeTeamId, 1)
    if (m.homeGoals === 0) add(cleanSheets, m.awayTeamId, 1)

    const margin = Math.abs(m.homeGoals - m.awayGoals)
    // 승부차기(정규시간 무승부)는 완승 후보에서 제외
    if (!m.wentToPenalties && (biggestWin === null || margin > Math.abs(biggestWin.homeGoals - biggestWin.awayGoals))) {
      if (margin > 0) biggestWin = m
    }
    const total = m.homeGoals + m.awayGoals
    if (highestScoring === null || total > highestScoring.homeGoals + highestScoring.awayGoals) {
      highestScoring = m
    }
  }

  const topScorers = Object.entries(goalsFor)
    .map(([teamId, goals]) => ({ teamId, goals }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 5)

  const bestDefense = Object.keys(conceded)
    .map((teamId) => ({ teamId, cleanSheets: cleanSheets[teamId] ?? 0, conceded: conceded[teamId] ?? 0 }))
    .sort((a, b) => b.cleanSheets - a.cleanSheets || a.conceded - b.conceded)
    .slice(0, 5)

  return {
    totalMatches: matches.length,
    totalGoals,
    avgGoalsPerMatch: matches.length ? totalGoals / matches.length : 0,
    penaltyShootouts,
    biggestWin,
    highestScoring,
    topScorers,
    bestDefense,
  }
}
