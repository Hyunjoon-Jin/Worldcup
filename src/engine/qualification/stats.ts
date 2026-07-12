import type { AllQualificationResult } from './index'
import type { QualMatch } from '../../types/qualification'

/** 한 팀의 예선 누적 성적. */
export interface QualTeamStat {
  teamId: string
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
}

/** 예선 전체 통계(F5). 랭킹 리더보드 + 최다 점수차 경기. */
export interface QualStats {
  topScorers: QualTeamStat[]
  bestDefense: QualTeamStat[]
  mostWins: QualTeamStat[]
  biggestWin: { match: QualMatch; margin: number } | null
}

function tallyMatch(map: Map<string, QualTeamStat>, teamId: string): QualTeamStat {
  let s = map.get(teamId)
  if (!s) {
    s = { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }
    map.set(teamId, s)
  }
  return s
}

/**
 * 모든 대륙 예선 경기를 누적해 팀별 성적과 리더보드를 만든다 (F5).
 * 각 팀은 자기 대륙 안에서만 경기하므로 대륙 구분 없이 팀 ID로 합산하면 된다.
 */
export function computeQualStats(all: AllQualificationResult, topN = 5): QualStats {
  const map = new Map<string, QualTeamStat>()
  let biggest: { match: QualMatch; margin: number } | null = null

  for (const confed of Object.keys(all.byConfederation)) {
    for (const m of all.byConfederation[confed].matches) {
      const home = tallyMatch(map, m.homeTeamId)
      const away = tallyMatch(map, m.awayTeamId)
      home.played++
      away.played++
      home.goalsFor += m.homeGoals
      home.goalsAgainst += m.awayGoals
      away.goalsFor += m.awayGoals
      away.goalsAgainst += m.homeGoals
      if (m.homeGoals > m.awayGoals) {
        home.wins++
        away.losses++
      } else if (m.homeGoals < m.awayGoals) {
        away.wins++
        home.losses++
      } else {
        home.draws++
        away.draws++
      }
      const margin = Math.abs(m.homeGoals - m.awayGoals)
      if (!biggest || margin > biggest.margin) biggest = { match: m, margin }
    }
  }

  const stats = [...map.values()]
  const topScorers = [...stats].sort((a, b) => b.goalsFor - a.goalsFor || a.goalsAgainst - b.goalsAgainst).slice(0, topN)
  // 최소 실점: 경기 수가 지나치게 적은 팀(엣지)은 제외하려 최소 3경기 이상만
  const bestDefense = [...stats]
    .filter((s) => s.played >= 3)
    .sort((a, b) => a.goalsAgainst - b.goalsAgainst || b.goalsFor - a.goalsFor)
    .slice(0, topN)
  const mostWins = [...stats].sort((a, b) => b.wins - a.wins || b.goalsFor - a.goalsFor).slice(0, topN)

  return { topScorers, bestDefense, mostWins, biggestWin: biggest }
}
