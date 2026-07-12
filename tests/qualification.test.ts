import { describe, expect, it } from 'vitest'
import { simulateConmebol } from '../src/engine/qualification/conmebol'
import { simulateAllQualification, simulateConfederation } from '../src/engine/qualification'
import { nationsByConfederation, baseRatingsMap, ALL_NATIONS, ALL_NATIONS_BY_ID } from '../src/data/nations'
import { SLOT_ALLOCATION } from '../src/data/confederations'
import { createSeededRandom } from '../src/engine/rng'
import type { Confederation } from '../src/types/team'

const conmebolIds = nationsByConfederation('CONMEBOL').map((t) => t.id)
const ratings = baseRatingsMap(conmebolIds)

describe('nations 레지스트리 (지역예선 Q1)', () => {
  it('CONMEBOL은 정확히 10개국', () => {
    expect(conmebolIds).toHaveLength(10)
  })
  it('본선 6국 + 비본선 4국이 모두 포함된다', () => {
    for (const id of ['ARG', 'BRA', 'URU', 'COL', 'ECU', 'PAR', 'CHI', 'PER', 'VEN', 'BOL']) {
      expect(conmebolIds).toContain(id)
    }
  })
  it('비본선 참가국도 능력치·랭킹이 있다', () => {
    expect(ALL_NATIONS_BY_ID.CHI.baseRatings.overall).toBeGreaterThan(0)
    expect(ALL_NATIONS_BY_ID.BOL.fifaRankApprox).toBe(58)
  })
})

describe('simulateConmebol (지역예선 Q2)', () => {
  it('슬롯 수를 정확히 지킨다: 6 직행 + 1 PO, 총 10팀 순위', () => {
    const r = simulateConmebol(ratings, createSeededRandom('conmebol-1'))
    expect(r.qualified).toHaveLength(SLOT_ALLOCATION.CONMEBOL.direct) // 6
    expect(r.playoff).toHaveLength(SLOT_ALLOCATION.CONMEBOL.playoff) // 1
    expect(r.standings).toHaveLength(10)
    // 직행 + PO + 탈락 = 10, 중복 없음
    expect(new Set(r.standings).size).toBe(10)
  })

  it('단일리그이므로 각 팀은 18경기(홈&어웨이 9상대)를 치른다', () => {
    const r = simulateConmebol(ratings, createSeededRandom('conmebol-2'))
    expect(r.matches).toHaveLength((10 * 9)) // 90경기(각 팀 18경기)
    const argMatches = r.matches.filter((m) => m.homeTeamId === 'ARG' || m.awayTeamId === 'ARG')
    expect(argMatches).toHaveLength(18)
  })

  it('같은 시드는 같은 예선 결과를 재현한다', () => {
    const a = simulateConmebol(ratings, createSeededRandom('same'))
    const b = simulateConmebol(ratings, createSeededRandom('same'))
    expect(a.standings).toEqual(b.standings)
  })

  it('여러 시드 평균에서 최강 아르헨티나의 직행률이 최약 볼리비아보다 높다', () => {
    let argQ = 0
    let bolQ = 0
    for (let s = 0; s < 40; s++) {
      const r = simulateConmebol(ratings, createSeededRandom(`agg-${s}`))
      if (r.qualified.includes('ARG')) argQ++
      if (r.qualified.includes('BOL')) bolQ++
    }
    expect(argQ).toBeGreaterThan(bolQ)
  })
})

describe('대륙별 예선 슬롯 정확성 (지역예선 Q2 확장)', () => {
  const allRatings = baseRatingsMap(ALL_NATIONS.map((t) => t.id))
  const cases: Array<[Confederation, number, number]> = [
    ['UEFA', 16, 0],
    ['CAF', 9, 1],
    ['AFC', 8, 1],
    ['CONMEBOL', 6, 1],
    ['OFC', 1, 1],
  ]
  for (const [confed, direct, playoff] of cases) {
    it(`${confed}: 직행 ${direct} + PO ${playoff}`, () => {
      const r = simulateConfederation(confed, allRatings, createSeededRandom(`${confed}-x`))
      expect(r.qualified).toHaveLength(direct)
      expect(r.playoff).toHaveLength(playoff)
    })
  }

  it('CONCACAF: 비개최국 시뮬은 직행 3 + PO 2 (개최 3국은 오케스트레이터에서 자동)', () => {
    const r = simulateConfederation('CONCACAF', allRatings, createSeededRandom('CCF'))
    expect(r.qualified).toHaveLength(SLOT_ALLOCATION.CONCACAF.direct - 3) // 3
    expect(r.playoff).toHaveLength(2)
    for (const host of ['MEX', 'USA', 'CAN']) expect(r.qualified).not.toContain(host)
  })
})

describe('simulateAllQualification — 본선 48 확정', () => {
  it('정확히 48개국, 중복 없음, 개최 3국 포함', () => {
    const all = simulateAllQualification('WORLD-2026')
    expect(all.qualified48).toHaveLength(48)
    expect(new Set(all.qualified48).size).toBe(48)
    for (const host of ['MEX', 'USA', 'CAN']) expect(all.qualified48).toContain(host)
  })

  it('대륙간 플레이오프는 6팀 → 2장', () => {
    const all = simulateAllQualification('WORLD-2026')
    expect(all.interConfed.participants).toHaveLength(6)
    expect(all.interConfed.winners).toHaveLength(2)
    for (const w of all.interConfed.winners) expect(all.qualified48).toContain(w)
  })

  it('같은 시드는 같은 본선 진출국을 재현한다', () => {
    const a = simulateAllQualification('SEED-Z')
    const b = simulateAllQualification('SEED-Z')
    expect(a.qualified48).toEqual(b.qualified48)
  })

  it('모든 진출국은 실존 등록국이다', () => {
    const all = simulateAllQualification('CHECK')
    for (const id of all.qualified48) expect(ALL_NATIONS_BY_ID[id]).toBeTruthy()
  })
})
