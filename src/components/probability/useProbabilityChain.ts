import { useEffect, useMemo } from 'react'
import { useSimulationStore } from '../../store/useSimulationStore'
import { useQualificationStore } from '../../store/useQualificationStore'
import type { TeamProbabilities } from '../../types/simulation'

export interface ChainRow {
  teamId: string
  /** 본선(월드컵) 진출 확률(%). 본선 진행 중이면 진출국은 100. 예선 진행 중이면 예선 진출 확률. */
  qualifyPct: number | null
  /** 본선 라운드별 확률(조별통과=32강 ~ 우승). 본선 시뮬 전(예선 중)이면 null. */
  finals: TeamProbabilities | null
}

export type ChainMode = 'finals' | 'qualification' | 'none'

/**
 * "본선진출 ~ 우승" 진출 확률 체인 데이터를 만든다.
 * - 본선 시뮬 결과가 있으면(조추첨 후): 진출국 본선진출 100% + 32강~우승 라운드별 확률.
 * - 없고 예선 결과만 있으면(예선 중): 예선 진출 확률(본선진출)만. 필요 시 예선 확률 계산을 트리거한다.
 */
export function useProbabilityChain(): { rows: ChainRow[]; mode: ChainMode; loading: boolean } {
  const simResult = useSimulationStore((s) => s.result)
  const qualResult = useQualificationStore((s) => s.result)
  const qualProbs = useQualificationStore((s) => s.probabilities)
  const qualProbLoading = useQualificationStore((s) => s.probLoading)
  const computeQualProbs = useQualificationStore((s) => s.computeProbabilities)

  // 본선 시뮬이 아직 없고 예선 결과만 있으면, 예선 진출 확률을 계산해 둔다(본선진출 그래프용).
  useEffect(() => {
    if (!simResult && qualResult && !qualProbs && !qualProbLoading) computeQualProbs()
  }, [simResult, qualResult, qualProbs, qualProbLoading, computeQualProbs])

  return useMemo(() => {
    if (simResult) {
      const rows: ChainRow[] = Object.values(simResult.probabilities).map((fp) => ({
        teamId: fp.teamId,
        qualifyPct: 100,
        finals: fp,
      }))
      return { rows, mode: 'finals', loading: false }
    }
    if (qualProbs) {
      const rows: ChainRow[] = Object.entries(qualProbs).map(([teamId, pct]) => ({
        teamId,
        qualifyPct: pct,
        finals: null,
      }))
      return { rows, mode: 'qualification', loading: qualProbLoading }
    }
    return { rows: [], mode: qualResult ? 'qualification' : 'none', loading: qualProbLoading }
  }, [simResult, qualProbs, qualProbLoading, qualResult])
}
