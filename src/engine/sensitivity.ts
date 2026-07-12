import { createSimulationAccumulator, type SimSnapshot } from './simCore'
import { clamp } from './config'

export interface SensitivityPoint {
  delta: number
  championPct: number
}

/**
 * 능력치 민감도 분석 (v2 #30). 특정 팀의 공격·수비·종합 능력치를 delta만큼 조정한 스냅샷으로
 * 각각 몬테카를로를 돌려 우승 확률이 어떻게 변하는지 본다. 엔진 순수화(#42) 덕분에 스냅샷의
 * ratings만 바꿔 간단히 실험할 수 있다.
 */
export function runSensitivity(
  snap: SimSnapshot,
  teamId: string,
  deltas: number[],
  iterations: number,
): SensitivityPoint[] {
  const base = snap.ratings[teamId]
  return deltas.map((delta) => {
    const modified: SimSnapshot = {
      ...snap,
      ratings: {
        ...snap.ratings,
        [teamId]: {
          attack: clamp(base.attack + delta, 35, 99),
          defense: clamp(base.defense + delta, 35, 99),
          form: base.form,
          overall: clamp(base.overall + delta, 35, 99),
        },
      },
    }
    const acc = createSimulationAccumulator(modified)
    acc.runBatch(iterations)
    return { delta, championPct: acc.result(0).probabilities[teamId].championPct }
  })
}
