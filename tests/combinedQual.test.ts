import { describe, expect, it, beforeEach } from 'vitest'
import { useQualificationStore } from '../src/store/useQualificationStore'
import { cupRankByTeam } from '../src/store/seasonActions'
import { runCupQualification } from '../src/engine/continental/cupQualification'
import { CUP_FORMATS } from '../src/data/continental/formats'
import { baseRatingsMap, nationsByConfederation } from '../src/data/nations'

/** 통합 예선(combinedWcq)이 월드컵 지역예선 캠페인을 '그대로' 반영하는지 검증. */
describe('AFC 아시안컵 통합 예선 = 월드컵 예선 캠페인', () => {
  beforeEach(() => {
    useQualificationStore.setState({ result: null, revealed: {} } as never)
  })

  it('아시안컵 진출국이 AFC 월드컵 예선 최종 순위 상위 N개국과 정확히 일치한다', () => {
    useQualificationStore.getState().simulate('COMBINED-TEST')
    const qr = useQualificationStore.getState().result
    expect(qr).not.toBeNull()
    const afc = qr!.byConfederation['AFC']

    const fmt = CUP_FORMATS['ASIAN']
    const pool = [...new Set(fmt.confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))]
    const rankByTeam = cupRankByTeam('ASIAN')
    expect(rankByTeam).toBeDefined()
    const res = runCupQualification(fmt, baseRatingsMap(pool), [], 'S', rankByTeam)

    // 개최국 없음 → 진출국 = AFC 캠페인 최종 순위 상위 fmt.teams개국(집합 일치).
    const campaignTop = new Set(afc.standings.slice(0, fmt.teams))
    expect(res.qualified).toHaveLength(fmt.teams)
    for (const id of res.qualified) expect(campaignTop.has(id)).toBe(true)
    // 월드컵 직행국은 반드시 아시안컵 본선에도 포함된다.
    for (const id of afc.qualified) expect(res.qualified).toContain(id)
  })

  it('예선 결과가 없으면 랭킹은 undefined(엔진이 FIFA 근사로 폴백)', () => {
    expect(cupRankByTeam('ASIAN')).toBeUndefined()
  })
})
