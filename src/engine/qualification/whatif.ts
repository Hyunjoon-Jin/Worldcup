import { ALL_NATIONS, baseRatingsMap } from '../../data/nations'
import { createQualProbAccumulator } from './probability'
import type { TeamRatings } from '../../types/team'

export interface WhatIfScenario {
  /** 능력치 가감치(overall·attack·defense에 동일 적용) */
  delta: number
  /** 해당 전력에서의 본선 진출 확률(%) */
  probability: number
}

const clamp = (v: number) => Math.max(1, Math.min(99, v))

/**
 * What-if 진출 분석 (G3). 내 팀 전력을 delta만큼 가감했을 때의 본선 진출 확률을
 * 시나리오별로 몬테카를로로 추정한다. 같은 seedBase는 재현된다.
 * baseRatings를 넘기면(컨디션·샌드박스 반영) 그 위에 delta를 적용한다.
 */
export function runWhatIfScenarios(
  teamId: string,
  deltas: number[],
  iterations: number,
  seedBase: string,
  baseRatings?: Record<string, TeamRatings>,
): WhatIfScenario[] {
  const base = baseRatings ?? baseRatingsMap(ALL_NATIONS.map((t) => t.id))
  const orig = base[teamId]
  if (!orig) return deltas.map((delta) => ({ delta, probability: 0 }))

  return deltas.map((delta) => {
    const ratings: Record<string, TeamRatings> = {
      ...base,
      [teamId]: {
        attack: clamp(orig.attack + delta),
        defense: clamp(orig.defense + delta),
        form: orig.form,
        overall: clamp(orig.overall + delta),
      },
    }
    // 공통난수(CRN): 모든 delta가 같은 시드 시퀀스를 쓰게 해, 차이가 오직 '내 팀 전력'에서만
    // 오도록 한다(시드가 다르면 전력을 올려도 확률이 내려가는 노이즈가 생김). 재현성도 유지.
    const acc = createQualProbAccumulator(`${seedBase}-wi`, ratings)
    acc.runBatch(iterations)
    return { delta, probability: acc.result()[teamId] ?? 0 }
  })
}
