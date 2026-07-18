import { describe, it, expect, beforeEach } from 'vitest'
import { recomputePerformanceDeltas } from '../src/store/performanceActions'
import { usePerformanceStore } from '../src/store/usePerformanceStore'
import { useContinentalHistoryStore } from '../src/store/useContinentalHistoryStore'
import { useQualificationStore } from '../src/store/useQualificationStore'
import { useProgressStore } from '../src/store/useProgressStore'
import { useCareerStore } from '../src/store/useCareerStore'

describe('성적→능력치 종합 반영', () => {
  beforeEach(() => {
    usePerformanceStore.getState().reset()
    useQualificationStore.setState({ result: null } as never)
    useCareerStore.setState({ carriedForm: {} } as never)
  })

  it('대륙컵 우승/준우승/3위가 예선 없이도 능력치에 반영된다(×0.5)', () => {
    useContinentalHistoryStore.setState({
      editions: [{ cupId: 'asianCup', year: 2027, champion: 'JPN', runnerUp: 'KOR', third: 'IRN' }],
    } as never)
    recomputePerformanceDeltas()
    const d = usePerformanceStore.getState().deltas
    expect(d.JPN).toBeCloseTo(1.5) // 3 * 0.5
    expect(d.KOR).toBeCloseTo(1.0) // 2 * 0.5
    expect(d.IRN).toBeCloseTo(0.5) // 1 * 0.5
    useContinentalHistoryStore.setState({ editions: [] } as never)
  })
})
