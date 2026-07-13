import { ALL_NATIONS, baseRatingsMap, nationsByConfederation } from '../../data/nations'
import { HOST_SLOTS } from '../../data/hostSlots'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { createSeededRandom, type RandomFn } from '../rng'
import { simulateGroupQualification, type LockedLookup } from './generic'
import { simulateAfc } from './afc'
import { simulateConcacaf } from './concacaf'
import { simulateUefa } from './uefa'
import { QUAL_FORMAT } from './formats'
import { simulateInterConfedPlayoff, type InterConfedResult } from './interConfed'
import type { Confederation, TeamRatings } from '../../types/team'
import type { QualificationResult } from '../../types/qualification'

/** 기본 개최국(2026): 멕시코·캐나다·미국. 커리어 모드에서 대회마다 달라질 수 있다. */
export const DEFAULT_HOST_IDS = Object.keys(HOST_SLOTS) // ['MEX','CAN','USA']

const CONFEDERATIONS: Confederation[] = ['UEFA', 'CAF', 'AFC', 'CONMEBOL', 'CONCACAF', 'OFC']

export interface AllQualificationResult {
  byConfederation: Record<string, QualificationResult>
  interConfed: InterConfedResult
  /** 개최국 자동 진출(참고용) */
  hosts: string[]
  /** 최종 본선 진출 48개국 */
  qualified48: string[]
}

/**
 * 한 대륙 예선을 시뮬레이션한다. 개최국(어느 대륙이든)은 자동 진출이라 풀에서 제외하고,
 * 그 대륙 소속 개최국 수만큼 직행 슬롯을 줄인다(개최국이 그 슬롯을 대신 차지).
 */
export function simulateConfederation(
  confed: Confederation,
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
  locked?: LockedLookup,
  hostIds: string[] = DEFAULT_HOST_IDS,
): QualificationResult {
  const hostSet = new Set(hostIds)
  const allConfedTeams = nationsByConfederation(confed).map((t) => t.id)
  const hostsInConfed = allConfedTeams.filter((id) => hostSet.has(id)).length
  const teams = allConfedTeams.filter((id) => !hostSet.has(id))
  const slots = SLOT_ALLOCATION[confed]
  const direct = Math.max(0, slots.direct - hostsInConfed)

  // 다단계·플레이오프 구조 대륙은 전용 엔진으로 실제 라운드 구성을 재현한다 (A3·A4·B14).
  if (confed === 'AFC') return simulateAfc(teams, ratings, rand, locked, direct)
  if (confed === 'CONCACAF') return simulateConcacaf(teams, ratings, rand, locked, direct)
  if (confed === 'UEFA') return simulateUefa(teams, ratings, rand, locked, direct)
  // 단일 조별 스테이지 대륙: 포맷(조 수·홈&어웨이)은 QUAL_FORMAT, 슬롯은 SLOT_ALLOCATION에서 (C4).
  const fmt = QUAL_FORMAT[confed]
  if (fmt.kind !== 'groups') throw new Error(`조별 포맷이 아닌 대륙: ${confed}`)
  return simulateGroupQualification(teams, ratings, rand, {
    confederation: confed,
    numGroups: fmt.numGroups,
    direct,
    playoff: slots.playoff,
    doubleRound: fmt.doubleRound,
  }, locked)
}

/**
 * 전체 지역예선을 시뮬레이션해 본선 48개국을 확정한다 (지역예선 Q2 오케스트레이터).
 * = 개최국 + 대륙별 직행 + 대륙간 PO 승자 2 = 48.
 *
 * hostIds로 개최국을 바꾸면(커리어 모드) 그 개최국이 자동 진출하고 소속 대륙 직행이 줄어든다.
 */
export function simulateAllQualification(
  seed: string,
  ratings: Record<string, TeamRatings> = baseRatingsMap(ALL_NATIONS.map((t) => t.id)),
  lockedByConfed?: Record<string, LockedLookup>,
  hostIds: string[] = DEFAULT_HOST_IDS,
): AllQualificationResult {
  const byConfederation: Record<string, QualificationResult> = {}
  const directQualified: string[] = []
  const playoffTeams: string[] = []

  for (const confed of CONFEDERATIONS) {
    const rand = createSeededRandom(`${seed}-${confed}`)
    const r = simulateConfederation(confed, ratings, rand, lockedByConfed?.[confed], hostIds)
    byConfederation[confed] = r
    directQualified.push(...r.qualified)
    playoffTeams.push(...r.playoff)
  }

  // 대륙간 플레이오프 (6팀 → 2장)
  const interConfed = simulateInterConfedPlayoff(playoffTeams, ratings, createSeededRandom(`${seed}-ICP`))

  const qualified48 = [...hostIds, ...directQualified, ...interConfed.winners]
  return { byConfederation, interConfed, hosts: hostIds, qualified48 }
}
