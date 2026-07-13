import { useMemo } from 'react'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useCareerStore } from '../../store/useCareerStore'
import { flattenPlayed, collectPlayedByConfed } from '../../engine/qualification/conditional'
import { computeLiveRanking, type FinalsResults, type LiveRankRow } from '../../engine/qualification/ranking'
import type { KnockoutMatch } from '../../types/match'

/**
 * 라이브 FIFA 랭킹 단일 출처(B9). 예선 진행 + 본선 진행 + 커리어 이월 점수를 반영한 실시간 순위를
 * 한 번 계산해 팀ID→순위/점수 맵과 행 목록으로 제공한다. 여러 컴포넌트가 정적 fifaRankApprox 대신
 * 이 훅을 참조하면 화면 전반의 "FIFA 순위" 표시가 일관된다.
 */
export function useLiveFifaRanking(): {
  rows: LiveRankRow[]
  rankByTeam: Record<string, number>
  pointsByTeam: Record<string, number>
  rowByTeam: Record<string, LiveRankRow>
  hasLive: boolean
} {
  const result = useQualificationStore((s) => s.result)
  const revealed = useQualificationStore((s) => s.revealed)
  const groupMatches = useProgressStore((s) => s.groupMatches)
  const knockoutSlots = useProgressStore((s) => s.knockoutSlots)
  const rankingBase = useCareerStore((s) => s.rankingBase)

  return useMemo(() => {
    if (!result) {
      return { rows: [], rankByTeam: {}, pointsByTeam: {}, rowByTeam: {}, hasLive: false }
    }
    const carried = Object.keys(rankingBase).length > 0 ? rankingBase : undefined
    const finals: FinalsResults = {
      groupMatches,
      knockoutMatches: Object.values(knockoutSlots)
        .map((s) => s.result)
        .filter((m): m is KnockoutMatch => m != null),
    }
    const rows = computeLiveRanking(result, flattenPlayed(collectPlayedByConfed(result, revealed)), finals, carried)
    const rankByTeam: Record<string, number> = {}
    const pointsByTeam: Record<string, number> = {}
    const rowByTeam: Record<string, LiveRankRow> = {}
    for (const r of rows) {
      rankByTeam[r.teamId] = r.rank
      pointsByTeam[r.teamId] = r.points
      rowByTeam[r.teamId] = r
    }
    return { rows, rankByTeam, pointsByTeam, rowByTeam, hasLive: true }
  }, [result, revealed, groupMatches, knockoutSlots, rankingBase])
}
