import { nationsByConfederation } from '../../data/nations'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { simulateGroupQualification } from './generic'
import type { RandomFn } from '../matchCore'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult } from '../../types/qualification'

/**
 * CONMEBOL(남미) 예선 — 10개국 단일리그(홈&어웨이). 범용 엔진의 numGroups=1·doubleRound 케이스.
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
