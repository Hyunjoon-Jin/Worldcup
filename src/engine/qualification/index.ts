import { ALL_NATIONS, baseRatingsMap, nationsByConfederation } from '../../data/nations'
import { HOST_SLOTS } from '../../data/hostSlots'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { createSeededRandom, type RandomFn } from '../rng'
import { simulateGroupQualification, type QualConfig } from './generic'
import { simulateInterConfedPlayoff, type InterConfedResult } from './interConfed'
import type { Confederation, TeamRatings } from '../../types/team'
import type { QualificationResult } from '../../types/qualification'

const HOST_IDS = Object.keys(HOST_SLOTS) // ['MEX','CAN','USA']

/**
 * 대륙별 예선 포맷 설정 (슬롯 정확 + 포맷 근사). numGroups는 참가국 풀 대비 조 크기가
 * 합리적이도록 정한 근사치. CONCACAF는 개최 3국 자동 진출이라 비개최국만 시뮬레이션한다.
 */
const CONFED_CONFIGS: Record<Confederation, Omit<QualConfig, 'confederation'>> = {
  UEFA: { numGroups: 8, direct: SLOT_ALLOCATION.UEFA.direct, playoff: SLOT_ALLOCATION.UEFA.playoff },
  CAF: { numGroups: 6, direct: SLOT_ALLOCATION.CAF.direct, playoff: SLOT_ALLOCATION.CAF.playoff },
  AFC: { numGroups: 4, direct: SLOT_ALLOCATION.AFC.direct, playoff: SLOT_ALLOCATION.AFC.playoff },
  CONMEBOL: { numGroups: 1, direct: SLOT_ALLOCATION.CONMEBOL.direct, playoff: SLOT_ALLOCATION.CONMEBOL.playoff, doubleRound: true },
  // CONCACAF direct는 개최 3국 포함 → 비개최국 대상 시뮬은 (direct-3)장
  CONCACAF: { numGroups: 3, direct: SLOT_ALLOCATION.CONCACAF.direct - HOST_IDS.length, playoff: SLOT_ALLOCATION.CONCACAF.playoff },
  OFC: { numGroups: 1, direct: SLOT_ALLOCATION.OFC.direct, playoff: SLOT_ALLOCATION.OFC.playoff },
}

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
  const cfg = CONFED_CONFIGS[confed]
  let teams = nationsByConfederation(confed).map((t) => t.id)
  if (confed === 'CONCACAF') teams = teams.filter((id) => !HOST_IDS.includes(id))
  return simulateGroupQualification(teams, ratings, rand, { confederation: confed, ...cfg })
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
