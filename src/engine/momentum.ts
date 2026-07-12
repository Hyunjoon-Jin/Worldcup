import { MOMENTUM, clamp } from './config'
import type { GroupMatch, KnockoutMatch } from '../types/match'

export type TeamMatchResult = 'win' | 'draw' | 'loss'

/**
 * 대회 진행 중 모멘텀 (C4). 최근 window 경기의 승/무/패를 최근 경기일수록 큰 가중치로 합산해
 * 폼 가감치를 만든다. 확정된 경기 결과에만 근거하므로 확률 계산과 실제 시뮬레이션이 같은 값을 본다.
 */
export function computeTeamMomentum(results: TeamMatchResult[]): number {
  const recent = results.slice(-MOMENTUM.window)
  if (recent.length === 0) return 0
  let m = 0
  recent.forEach((r, i) => {
    const weight = (i + 1) / recent.length // 뒤(최근)일수록 큰 가중치
    if (r === 'win') m += MOMENTUM.winBonus * weight
    else if (r === 'loss') m -= MOMENTUM.lossPenalty * weight
  })
  return clamp(Math.round(m), -MOMENTUM.max, MOMENTUM.max)
}

/** 확정된 조별/토너먼트 경기에서 팀별 시간순 결과 목록을 만든다. */
export function collectTeamResults(
  groupMatches: GroupMatch[],
  knockoutMatches: KnockoutMatch[],
): Record<string, TeamMatchResult[]> {
  const map: Record<string, TeamMatchResult[]> = {}
  const push = (teamId: string, r: TeamMatchResult) => {
    ;(map[teamId] ??= []).push(r)
  }
  for (const m of [...groupMatches].sort((a, b) => a.matchday - b.matchday)) {
    if (m.homeGoals === m.awayGoals) {
      push(m.homeTeamId, 'draw')
      push(m.awayTeamId, 'draw')
    } else if (m.homeGoals > m.awayGoals) {
      push(m.homeTeamId, 'win')
      push(m.awayTeamId, 'loss')
    } else {
      push(m.homeTeamId, 'loss')
      push(m.awayTeamId, 'win')
    }
  }
  // 토너먼트는 승부차기 포함 항상 승자가 있으므로 win/loss로 귀결
  for (const m of knockoutMatches) {
    const loser = m.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId
    push(m.winnerTeamId, 'win')
    push(loser, 'loss')
  }
  return map
}

export function computeMomentumOffsets(
  groupMatches: GroupMatch[],
  knockoutMatches: KnockoutMatch[],
): Record<string, number> {
  const results = collectTeamResults(groupMatches, knockoutMatches)
  const offsets: Record<string, number> = {}
  for (const [id, list] of Object.entries(results)) offsets[id] = computeTeamMomentum(list)
  return offsets
}
