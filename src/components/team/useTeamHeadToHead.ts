import { useMemo } from 'react'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useContinentalStore } from '../../store/useContinentalStore'
import { flattenPlayed, collectPlayedByConfed } from '../../engine/qualification/conditional'
import { cupToRankingResults } from '../../engine/continental/runCup'
import { computeHeadToHead, type H2HInputMatch, type H2HRecord } from '../../engine/h2h'
import type { KnockoutMatch } from '../../types/match'

/**
 * 지정 팀의 상대전적 단일 출처(E). 이번 사이클에 치른 모든 경기(예선·대륙간 PO·친선·본선·대륙컵)를
 * 스토어에서 모아 computeHeadToHead로 상대별 전적을 계산한다. 진행이 없으면 빈 배열.
 */
export function useTeamHeadToHead(teamId: string | null): H2HRecord[] {
  const result = useQualificationStore((s) => s.result)
  const revealed = useQualificationStore((s) => s.revealed)
  const friendlies = useQualificationStore((s) => s.friendlies)
  const groupMatches = useProgressStore((s) => s.groupMatches)
  const knockoutSlots = useProgressStore((s) => s.knockoutSlots)
  const cupResult = useContinentalStore((s) => s.result)

  return useMemo(() => {
    if (!teamId) return []
    const matches: H2HInputMatch[] = []

    if (result) {
      // 월드컵 예선(공개된 경기일까지) + 대륙간 PO
      for (const m of flattenPlayed(collectPlayedByConfed(result, revealed))) {
        matches.push({ competition: 'qual', homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals })
      }
      for (const m of result.interConfed.matches) {
        matches.push({ competition: 'playoff', homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals, wentToPenalties: m.wentToPenalties, winnerTeamId: m.winnerTeamId })
      }
      // 친선(공개된 경기일까지)
      const globalRevealed = Math.max(0, ...Object.values(revealed))
      for (const f of friendlies) {
        if (f.matchday <= globalRevealed) matches.push({ competition: 'friendly', homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeGoals: f.homeGoals, awayGoals: f.awayGoals })
      }
    }

    // 월드컵 본선(조별 + 녹아웃)
    for (const m of groupMatches) {
      matches.push({ competition: 'wc', homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals })
    }
    const koMatches = Object.values(knockoutSlots)
      .map((s) => s.result)
      .filter((m): m is KnockoutMatch => m != null)
    for (const m of koMatches) {
      matches.push({ competition: 'wc', homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals, wentToPenalties: m.wentToPenalties, winnerTeamId: m.winnerTeamId })
    }

    // 대륙컵(조별 + 녹아웃)
    if (cupResult) {
      const cr = cupToRankingResults(cupResult)
      for (const m of cr.groupMatches) matches.push({ competition: 'cup', homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals })
      for (const m of cr.knockoutMatches) matches.push({ competition: 'cup', homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals, wentToPenalties: m.wentToPenalties, winnerTeamId: m.winnerTeamId })
    }

    return computeHeadToHead(teamId, matches)
  }, [teamId, result, revealed, friendlies, groupMatches, knockoutSlots, cupResult])
}
