import { nationsByConfederation } from '../../data/nations'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { simulateGroupQualification } from './generic'
import type { RandomFn } from '../matchCore'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult } from '../../types/qualification'

/**
 * CONMEBOL(남미) 예선 — 10개국 단일리그(홈&어웨이). 범용 엔진의 numGroups=1·doubleRound 케이스.
 *
 * [D29 주의] 이 함수는 CONMEBOL 단일리그 포맷을 단독으로 검증하기 위한 참조/테스트용이다. 실제
 * 오케스트레이터(index.ts)는 개최국 제외·슬롯 계산을 거쳐 simulateGroupQualification으로 CONMEBOL을
 * 처리하므로, 라이브 경로는 이 함수를 쓰지 않는다(개최국 제외 없음 — 2026 CONMEBOL엔 개최국이 없어 무해).
 */
export function simulateConmebol(ratings: Record<string, TeamRatings>, rand: RandomFn): QualificationResult {
  const teams = nationsByConfederation('CONMEBOL').map((t) => t.id)
  const { direct, playoff } = SLOT_ALLOCATION.CONMEBOL
  return simulateGroupQualification(teams, ratings, rand, {
    confederation: 'CONMEBOL',
    numGroups: 1,
    direct,
    playoff,
    doubleRound: true,
  })
}
