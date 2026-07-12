import { ALL_NATIONS_BY_ID } from '../../data/nations'
import type { AllQualificationResult } from './index'

export interface QualDrama {
  /** 랭킹이 낮은데 본선에 오른 '깜짝 진출' (랭킹 숫자 큰 순) */
  surpriseQualifiers: { teamId: string; rank: number }[]
  /** 랭킹이 높은데 탈락한 '충격 탈락' (랭킹 숫자 작은 순) */
  shockEliminations: { teamId: string; rank: number }[]
}

/**
 * 예선 드라마 추출 (지역예선 Q6). 진출/탈락 명단을 랭킹과 대조해 이변을 뽑는다.
 * 개최국(자동 진출)은 제외한다.
 */
export function extractQualDrama(all: AllQualificationResult, limit = 5): QualDrama {
  const qualifiedSet = new Set(all.qualified48)
  const hostSet = new Set(all.hosts)

  const nonHostQualified = all.qualified48
    .filter((id) => !hostSet.has(id))
    .map((id) => ({ teamId: id, rank: ALL_NATIONS_BY_ID[id]?.fifaRankApprox ?? 999 }))

  // 각 대륙 예선에 참가했다가 탈락한 팀(진출/PO에 없는 팀)
  const eliminated: { teamId: string; rank: number }[] = []
  for (const r of Object.values(all.byConfederation)) {
    for (const id of r.standings) {
      if (!qualifiedSet.has(id) && !all.interConfed.winners.includes(id)) {
        eliminated.push({ teamId: id, rank: ALL_NATIONS_BY_ID[id]?.fifaRankApprox ?? 999 })
      }
    }
  }

  const surpriseQualifiers = [...nonHostQualified].sort((a, b) => b.rank - a.rank).slice(0, limit)
  const shockEliminations = [...eliminated].sort((a, b) => a.rank - b.rank).slice(0, limit)
  return { surpriseQualifiers, shockEliminations }
}
