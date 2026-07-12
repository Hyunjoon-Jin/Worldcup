import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { simulateKnockoutRaw, type RandomFn } from '../matchCore'
import type { KnockoutMatch } from '../../types/match'
import type { TeamRatings } from '../../types/team'

export interface InterConfedResult {
  participants: string[]
  winners: string[]
  matches: KnockoutMatch[]
}

/**
 * 대륙간 플레이오프 (지역예선). 6개 대륙 PO팀 → 2장. 랭킹 상위 2팀은 결승 시드(부전승),
 * 나머지 4팀이 준결승 2경기 → 승자가 시드와 결승 → 2명의 결승 승자가 본선 진출.
 */
export function simulateInterConfedPlayoff(
  participants: string[],
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
): InterConfedResult {
  const matches: KnockoutMatch[] = []
  const play = (round: KnockoutMatch['round'], slotId: string, a: string, b: string): string => {
    const r = simulateKnockoutRaw(a, ratings[a], b, ratings[b], 0, 0, rand)
    matches.push({
      round,
      slotId,
      homeTeamId: a,
      awayTeamId: b,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      wentToPenalties: r.wentToPenalties,
      winnerTeamId: r.winnerTeamId,
    })
    return r.winnerTeamId
  }

  // 6팀 미만이면(엣지) 랭킹 상위부터 채워 2장 배정
  const seeded = [...participants].sort(
    (a, b) => ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox,
  )
  if (seeded.length < 4) {
    return { participants, winners: seeded.slice(0, 2), matches }
  }

  const [s1, s2, s3, s4, s5, s6] = seeded
  // 준결승: 3위 vs 6위, 4위 vs 5위 (6팀 미만이면 존재하는 팀만)
  const semiA = s6 ? play('SF', 'ICP-SF1', s3, s6) : s3
  const semiB = s5 ? play('SF', 'ICP-SF2', s4, s5) : s4
  // 결승: 1위 vs 준결승A 승자, 2위 vs 준결승B 승자
  const w1 = play('FINAL', 'ICP-F1', s1, semiA)
  const w2 = play('FINAL', 'ICP-F2', s2, semiB)
  return { participants, winners: [w1, w2], matches }
}
