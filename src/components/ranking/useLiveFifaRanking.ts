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

  return useMemo(() => computeShared(result, revealed, groupMatches, knockoutSlots, rankingBase), [
    result,
    revealed,
    groupMatches,
    knockoutSlots,
    rankingBase,
  ])
}

/**
 * 라이브 FIFA 순위 조회 함수. 진행 이력이 있으면 실시간 순위를, 없으면 fallback(정적 근사 순위)을
 * 돌려준다. 화면 곳곳의 'FIFA X위' 표시를 실시간 순위와 일관되게 맞추는 데 쓴다.
 */
export function useLiveRankLookup(): (teamId: string, fallback: number) => number {
  const { rankByTeam } = useLiveFifaRanking()
  return (teamId, fallback) => rankByTeam[teamId] ?? fallback
}

type LiveRankingOutput = {
  rows: LiveRankRow[]
  rankByTeam: Record<string, number>
  pointsByTeam: Record<string, number>
  rowByTeam: Record<string, LiveRankRow>
  hasLive: boolean
}

// 모듈 단위 캐시: 여러 컴포넌트가 이 훅을 동시에 써도(경기 상세·순위표 등) 입력이 같으면 계산을 한 번만 한다.
// 스토어가 같은 참조를 돌려주는 한(값이 바뀌지 않으면) 마지막 계산을 재사용한다.
let cache: { keys: unknown[]; value: LiveRankingOutput } | null = null

function computeShared(
  result: ReturnType<typeof useQualificationStore.getState>['result'],
  revealed: Record<string, number>,
  groupMatches: ReturnType<typeof useProgressStore.getState>['groupMatches'],
  knockoutSlots: ReturnType<typeof useProgressStore.getState>['knockoutSlots'],
  rankingBase: Record<string, number>,
): LiveRankingOutput {
  const keys = [result, revealed, groupMatches, knockoutSlots, rankingBase]
  if (cache && cache.keys.length === keys.length && cache.keys.every((k, i) => k === keys[i])) return cache.value

  let value: LiveRankingOutput
  if (!result) {
    value = { rows: [], rankByTeam: {}, pointsByTeam: {}, rowByTeam: {}, hasLive: false }
  } else {
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
    value = { rows, rankByTeam, pointsByTeam, rowByTeam, hasLive: true }
  }
  cache = { keys, value }
  return value
}
