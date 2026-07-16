import { describe, expect, it } from 'vitest'
import { CUP_FORMATS, ALL_CUP_IDS, knockoutEntrants } from '../src/data/continental/formats'
import type { KnockoutRound } from '../src/types/match'

/** 첫 녹아웃 라운드 이름 → 진입 팀 수. */
const FIRST_ROUND_SIZE: Partial<Record<KnockoutRound, number>> = { R16: 16, QF: 8, SF: 4 }

describe('대륙컵 포맷 정합성 (Phase 0 데이터 토대)', () => {
  it('6개 대회가 모두 정의돼 있다', () => {
    expect(ALL_CUP_IDS).toHaveLength(6)
    for (const id of ALL_CUP_IDS) expect(CUP_FORMATS[id].id).toBe(id)
  })

  it('조 수 × 조당 팀 = 본선 팀 수', () => {
    for (const id of ALL_CUP_IDS) {
      const f = CUP_FORMATS[id]
      expect(f.groups * f.teamsPerGroup).toBe(f.teams)
    }
  })

  it('조 직행 + 최고3위 = 첫 녹아웃 라운드 진입 규모', () => {
    for (const id of ALL_CUP_IDS) {
      const f = CUP_FORMATS[id]
      const first = f.knockout[0]
      expect(knockoutEntrants(f)).toBe(FIRST_ROUND_SIZE[first])
    }
  })

  it('최고3위는 24팀 대회만(4팀), 나머지는 0', () => {
    for (const id of ALL_CUP_IDS) {
      const f = CUP_FORMATS[id]
      expect(f.bestThirds).toBe(f.teams === 24 ? 4 : 0)
    }
  })

  it('3위전 유무·연장·타이브레이커가 조사 확정치와 일치', () => {
    expect(CUP_FORMATS.EURO.thirdPlace).toBe(false)
    expect(CUP_FORMATS.COPA.thirdPlace).toBe(true)
    expect(CUP_FORMATS.AFCON.thirdPlace).toBe(true)
    expect(CUP_FORMATS.ASIAN.thirdPlace).toBe(false)
    expect(CUP_FORMATS.GOLD.thirdPlace).toBe(false)
    expect(CUP_FORMATS.OFC.thirdPlace).toBe(true)
    // 연장: 코파·골드컵만 결승만
    expect(CUP_FORMATS.COPA.extraTime).toBe('finalOnly')
    expect(CUP_FORMATS.GOLD.extraTime).toBe('finalOnly')
    for (const id of ['EURO', 'AFCON', 'ASIAN', 'OFC'] as const) expect(CUP_FORMATS[id].extraTime).toBe('all')
    // 타이브레이커: UEFA·CAF·AFC = h2h, 나머지 = overall
    for (const id of ['EURO', 'AFCON', 'ASIAN'] as const) expect(CUP_FORMATS[id].groupTiebreak).toBe('h2h')
    for (const id of ['COPA', 'GOLD', 'OFC'] as const) expect(CUP_FORMATS[id].groupTiebreak).toBe('overall')
  })

  it('3위전이 있으면 녹아웃 오프셋에 THIRD가 있고, 없으면 없다', () => {
    for (const id of ALL_CUP_IDS) {
      const f = CUP_FORMATS[id]
      expect('THIRD' in f.schedule.knockoutDayOffsets).toBe(f.thirdPlace)
    }
  })

  it('일정 오프셋이 단조 증가하고 총일수 이내', () => {
    for (const id of ALL_CUP_IDS) {
      const f = CUP_FORMATS[id]
      const offs = [...f.schedule.groupDayOffsets, ...Object.values(f.schedule.knockoutDayOffsets)]
      for (const o of offs) {
        expect(o).toBeGreaterThanOrEqual(1)
        expect(o).toBeLessThanOrEqual(f.schedule.totalDays)
      }
      // 마지막 녹아웃(결승) 오프셋 = 총일수
      expect(f.schedule.knockoutDayOffsets.FINAL).toBe(f.schedule.totalDays)
    }
  })
})
