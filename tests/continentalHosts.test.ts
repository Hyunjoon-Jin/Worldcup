import { describe, expect, it } from 'vitest'
import { selectCupHosts } from '../src/engine/continental/hostSelection'
import { CO_HOST_AFFINITY, hostWeight } from '../src/data/continental/hosts'
import { CUP_FORMATS, ALL_CUP_IDS } from '../src/data/continental/formats'
import { nationsByConfederation, ALL_NATIONS_BY_ID } from '../src/data/nations'

function confedPool(cupId) {
  return new Set(CUP_FORMATS[cupId].confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))
}

describe('대륙컵 개최국 자동 선정', () => {
  it('결정론적 — 같은 시드는 항상 같은 개최국(에디션 고정 속성)', () => {
    for (const cupId of ALL_CUP_IDS) {
      const a = selectCupHosts(CUP_FORMATS[cupId], `${cupId}-2028`)
      const b = selectCupHosts(CUP_FORMATS[cupId], `${cupId}-2028`)
      expect(a).toEqual(b)
    }
  })

  it('개최국은 항상 1개 이상이고 모두 참가 연맹 소속국이다', () => {
    for (const cupId of ALL_CUP_IDS) {
      const pool = confedPool(cupId)
      for (const year of [2027, 2028, 2029, 2030, 2031]) {
        const hosts = selectCupHosts(CUP_FORMATS[cupId], `${cupId}-${year}`)
        expect(hosts.length).toBeGreaterThanOrEqual(1)
        for (const h of hosts) expect(pool.has(h)).toBe(true)
      }
    }
  })

  it('개최국에 중복이 없다', () => {
    for (const cupId of ALL_CUP_IDS) {
      for (const year of [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033]) {
        const hosts = selectCupHosts(CUP_FORMATS[cupId], `${cupId}-${year}`)
        expect(new Set(hosts).size).toBe(hosts.length)
      }
    }
  })

  it('공동개최국은 지리적 인접(affinity) 파트너로만 구성된다', () => {
    for (const cupId of ALL_CUP_IDS) {
      for (let y = 2026; y < 2066; y++) {
        const hosts = selectCupHosts(CUP_FORMATS[cupId], `${cupId}-${y}`)
        if (hosts.length <= 1) continue
        const [primary, ...coHosts] = hosts
        const partners = new Set(CO_HOST_AFFINITY[primary] ?? [])
        for (const co of coHosts) expect(partners.has(co)).toBe(true)
      }
    }
  })

  it('공동개최가 최소 한 번은 발생한다(EURO — 인접국 다수)', () => {
    let coHostSeen = false
    for (let y = 2026; y < 2086 && !coHostSeen; y++) {
      if (selectCupHosts(CUP_FORMATS.EURO, `EURO-${y}`).length > 1) coHostSeen = true
    }
    expect(coHostSeen).toBe(true)
  })

  it('경제·인프라 가중이 반영된다 — 큐레이션된 주요 개최국이 개최를 지배한다(EURO)', () => {
    const N = 500
    let curated = 0
    const gerCount: Record<string, number> = {}
    for (let y = 0; y < N; y++) {
      const primary = selectCupHosts(CUP_FORMATS.EURO, `EURO-W${y}`)[0]
      gerCount[primary] = (gerCount[primary] ?? 0) + 1
      if (hostWeight(ALL_NATIONS_BY_ID[primary]) >= 40) curated++
    }
    // 주요 개최국(가중 40+)이 전체의 과반을 크게 넘겨 개최한다(무명국 독식 방지).
    expect(curated / N).toBeGreaterThan(0.75)
    // 최상위 가중국(독일·잉글랜드 등)은 개별 무명국보다 훨씬 자주 뽑힌다.
    const ger = gerCount['GER'] ?? 0
    const maxSmall = Math.max(0, ...Object.entries(gerCount).filter(([id]) => hostWeight(ALL_NATIONS_BY_ID[id]) < 20).map(([, c]) => c))
    expect(ger).toBeGreaterThan(maxSmall)
  })
})
