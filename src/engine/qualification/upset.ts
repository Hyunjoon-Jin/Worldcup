import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { CONFEDERATION_LABEL_KO } from '../../data/teams'
import type { AllQualificationResult } from './index'
import type { UpsetArticleParams } from '../upsetArticle'
import type { Confederation } from '../../types/team'

/** rank 차이(양수 = 약체가 강호를 이김)를 경기 전 약체 예상 승률(%)로 근사. */
function forecastPctFromGap(rankGap: number): number {
  // 격차가 클수록 낮게. 대략 45% → 2% 범위로 클램프.
  return Math.max(2, Math.min(45, 40 - rankGap * 0.4))
}

/**
 * 전체 예선에서 "최대 이변" 경기를 하나 고른다 (F2). 낮은 랭킹 팀이 훨씬 높은 랭킹 팀을
 * 꺾은 경기 중, 랭킹 격차(그다음 골 차)가 가장 큰 경기를 결정적으로 선택한다.
 * 의미 있는 이변이 없으면 null.
 */
export function pickQualUpset(all: AllQualificationResult, minGap = 15): UpsetArticleParams | null {
  let best: { params: UpsetArticleParams; gap: number; margin: number } | null = null

  for (const confed of Object.keys(all.byConfederation)) {
    const label = `${CONFEDERATION_LABEL_KO[confed as Confederation] ?? confed} 예선`
    for (const m of all.byConfederation[confed].matches) {
      if (m.homeGoals === m.awayGoals) continue // 무승부 제외(승리 이변만)
      const winnerId = m.homeGoals > m.awayGoals ? m.homeTeamId : m.awayTeamId
      const loserId = m.homeGoals > m.awayGoals ? m.awayTeamId : m.homeTeamId
      const w = ALL_NATIONS_BY_ID[winnerId]
      const l = ALL_NATIONS_BY_ID[loserId]
      if (!w || !l) continue
      const gap = w.fifaRankApprox - l.fifaRankApprox // 양수면 약체(승자)가 강호를 이김
      if (gap < minGap) continue
      const winnerGoals = Math.max(m.homeGoals, m.awayGoals)
      const loserGoals = Math.min(m.homeGoals, m.awayGoals)
      const margin = winnerGoals - loserGoals
      if (!best || gap > best.gap || (gap === best.gap && margin > best.margin)) {
        best = {
          gap,
          margin,
          params: {
            winnerTeamId: winnerId,
            loserTeamId: loserId,
            winnerGoals,
            loserGoals,
            isDraw: false,
            wentToPenalties: false,
            underdogForecastPct: forecastPctFromGap(gap),
            roundLabel: label,
          },
        }
      }
    }
  }

  return best?.params ?? null
}
