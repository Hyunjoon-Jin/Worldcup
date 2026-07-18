import { describe, expect, it, beforeEach } from 'vitest'
import { useQualificationStore, buildConfedLockedProbInputs } from '../src/store/useQualificationStore'
import { cupRankByTeam } from '../src/store/seasonActions'
import { runCupQualification } from '../src/engine/continental/cupQualification'
import { computeCupQualProbabilities } from '../src/engine/continental/cupQualProbability'
import { combinedCupDirectQualified } from '../src/engine/continental/combinedQual'
import { CUP_FORMATS } from '../src/data/continental/formats'
import { baseRatingsMap, nationsByConfederation } from '../src/data/nations'

/** 통합 예선(combinedWcq)이 아시안컵 실제 규칙(월드컵 2차 예선 통과 = 직행 확보)을 반영하는지 검증. */
describe('AFC 아시안컵 통합 예선 = 월드컵 예선 캠페인 규칙', () => {
  beforeEach(() => {
    useQualificationStore.setState({ result: null, revealed: {} } as never)
  })

  it('월드컵 2차 예선을 통과(3차 예선 도달)한 팀은 전원 아시안컵 본선에 진출한다', () => {
    useQualificationStore.getState().simulate('COMBINED-TEST')
    const qr = useQualificationStore.getState().result
    expect(qr).not.toBeNull()
    const afc = qr!.byConfederation['AFC']

    const fmt = CUP_FORMATS['ASIAN']
    const pool = [...new Set(fmt.confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))]
    const rankByTeam = cupRankByTeam('ASIAN')
    expect(rankByTeam).toBeDefined()
    const res = runCupQualification(fmt, baseRatingsMap(pool), [], 'S', rankByTeam)

    expect(res.qualified).toHaveLength(fmt.teams)
    // 핵심: 3차 예선에 도달한(2차 예선 통과) 팀은 정적 FIFA 랭킹과 무관하게 전원 아시안컵 진출.
    const direct = combinedCupDirectQualified(afc)
    expect(direct.size).toBeGreaterThan(0)
    expect(direct.size).toBeLessThanOrEqual(fmt.teams)
    for (const id of direct) expect(res.qualified).toContain(id)
    // 월드컵 직행국(직행 자격 확보의 부분집합)도 반드시 포함된다.
    for (const id of afc.qualified) expect(res.qualified).toContain(id)
  })

  it('예선 결과가 없으면 랭킹은 undefined(엔진이 FIFA 근사로 폴백)', () => {
    expect(cupRankByTeam('ASIAN')).toBeUndefined()
  })

  it('예선 완료 후 2차 통과(3차 도달) 팀은 아시안컵 진출 확률이 100%다 (대만 케이스)', () => {
    useQualificationStore.getState().simulate('LOCKED-TEST')
    const qr = useQualificationStore.getState().result!
    const afc = qr.byConfederation['AFC']
    // 전 경기 공개(예선 완료) — 이제 실제 결과가 고정돼야 한다.
    useQualificationStore.setState({ revealed: { AFC: afc.matchdays } } as never)

    const { ratings, locked } = buildConfedLockedProbInputs('AFC')
    expect(locked).toBeDefined()
    const fmt = CUP_FORMATS['ASIAN']
    const p = computeCupQualProbabilities(fmt, ratings, [], 30, 'LOCKED', { locked })

    // 2차 통과(3차 도달) 팀은 정적 FIFA 랭킹과 무관하게 전원 100%여야 한다.
    const direct = [...combinedCupDirectQualified(afc)]
    expect(direct.length).toBeGreaterThan(0)
    for (const id of direct) expect(p[id]).toBe(100)
  })
})
