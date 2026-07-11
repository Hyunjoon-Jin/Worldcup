import { useMemo } from 'react'
import { useSimulationStore } from './useSimulationStore'

/** 직전 계산 대비 32강(조별통과) 진출 확률이 이 퍼센트포인트 이상 떨어지면 "위기"로 표시한다.
 * 몬테카를로 표본 변동성으로 인한 사소한 등락은 위기로 잡히지 않도록 여유를 둔 문턱값이다. */
const CRISIS_DROP_THRESHOLD = 5

export interface CrisisInfo {
  drop: number
}

/** 팀 ID → 위기 정보(확률 하락폭)의 맵. 위기가 아닌 팀은 맵에 없다. */
export function useCrisisTeams(): Record<string, CrisisInfo> {
  const result = useSimulationStore((s) => s.result)
  const previousResult = useSimulationStore((s) => s.previousResult)

  return useMemo(() => {
    const crisis: Record<string, CrisisInfo> = {}
    if (!result || !previousResult) return crisis
    for (const teamId of Object.keys(result.probabilities)) {
      const current = result.probabilities[teamId]?.groupStagePct
      const previous = previousResult.probabilities[teamId]?.groupStagePct
      if (current == null || previous == null) continue
      const drop = previous - current
      if (drop >= CRISIS_DROP_THRESHOLD) crisis[teamId] = { drop }
    }
    return crisis
  }, [result, previousResult])
}
