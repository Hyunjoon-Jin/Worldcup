import { ALL_NATIONS, baseRatingsMap, nationsByConfederation } from '../../data/nations'
import { HOST_SLOTS } from '../../data/hostSlots'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { createSeededRandom, type RandomFn } from '../rng'
import { simulateGroupQualification } from './generic'
import { simulateAfc } from './afc'
import { simulateConcacaf } from './concacaf'
import { QUAL_FORMAT } from './formats'
import { simulateInterConfedPlayoff, type InterConfedResult } from './interConfed'
import type { Confederation, TeamRatings } from '../../types/team'
import type { QualificationResult } from '../../types/qualification'

const HOST_IDS = Object.keys(HOST_SLOTS) // ['MEX','CAN','USA']

const CONFEDERATIONS: Confederation[] = ['UEFA', 'CAF', 'AFC', 'CONMEBOL', 'CONCACAF', 'OFC']

export interface AllQualificationResult {
  byConfederation: Record<string, QualificationResult>
  interConfed: InterConfedResult
  /** 개최국 자동 진출(참고용) */
  hosts: string[]
  /** 최종 본선 진출 48개국 */
  qualified48: string[]
}

/** 한 대륙 예선을 시뮬레이션한다(CONCACAF는 개최국 제외 풀). */
export function simulateConfederation(
  confed: Confederation,
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
): QualificationResult {
  const teams = nationsByConfederation(confed).map((t) => t.id)
  // 다단계 구조 대륙은 전용 엔진으로 실제 라운드 구성을 근사한다 (A3·A4).
  if (confed === 'AFC') return simulateAfc(teams, ratings, rand)
  if (confed === 'CONCACAF') return simulateConcacaf(teams, ratings, rand) // 개최국 필터는 내부 처리
  // 단일 조별 스테이지 대륙: 포맷(조 수·홈&어웨이)은 QUAL_FORMAT, 슬롯은 SLOT_ALLOCATION에서 (C4).
  const fmt = QUAL_FORMAT[confed]
  if (fmt.kind !== 'groups') throw new Error(`조별 포맷이 아닌 대륙: ${confed}`)
  const slots = SLOT_ALLOCATION[confed]
  return simulateGroupQualification(teams, ratings, rand, {
    confederation: confed,
    numGroups: fmt.numGroups,
    direct: slots.direct,
    playoff: slots.playoff,
    doubleRound: fmt.doubleRound,
  })
}

/**
 * 전체 지역예선을 시뮬레이션해 본선 48개국을 확정한다 (지역예선 Q2 오케스트레이터).
 * = 대륙별 직행 46(개최 3국 포함) + 대륙간 PO 승자 2.
 *
 * ratings를 주입하면(컨디션·샌드박스 반영 등, D1) 그 능력치로 시뮬레이션한다. 미지정 시
 * base 능력치를 사용한다(순수 함수로 테스트 가능).
 */
export function simulateAllQualification(
  seed: string,
  ratings: Record<string, TeamRatings> = baseRatingsMap(ALL_NATIONS.map((t) => t.id)),
): AllQualificationResult {
  const byConfederation: Record<string, QualificationResult> = {}
  const directQualified: string[] = []
  const playoffTeams: string[] = []

  for (const confed of CONFEDERATIONS) {
    const rand = createSeededRandom(`${seed}-${confed}`)
    const r = simulateConfederation(confed, ratings, rand)
    byConfederation[confed] = r
    directQualified.push(...r.qualified)
    playoffTeams.push(...r.playoff)
  }

  // 대륙간 플레이오프 (6팀 → 2장)
  const interConfed = simulateInterConfedPlayoff(playoffTeams, ratings, createSeededRandom(`${seed}-ICP`))

  const qualified48 = [...HOST_IDS, ...directQualified, ...interConfed.winners]
  return { byConfederation, interConfed, hosts: HOST_IDS, qualified48 }
}
