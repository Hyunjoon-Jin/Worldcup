import { describe, expect, it } from 'vitest'
import { createInitialDrawState, drawNext, isDrawComplete, isValidPlacement, runSeededDraw } from '../src/engine/drawEngine'
import { TEAMS_BY_ID } from '../src/data/teams'
import { GROUP_LETTERS } from '../src/data/hostSlots'

describe('drawEngine — 초기 상태', () => {
  it('개최국 3팀이 각 조 1번 시드에 사전 고정된다', () => {
    const s = createInitialDrawState()
    expect(s.groups.A[0]).toBe('MEX')
    expect(s.groups.B[0]).toBe('CAN')
    expect(s.groups.D[0]).toBe('USA')
  })

  it('포트1 풀에는 개최국을 제외한 9팀, 나머지 포트는 12팀씩 들어간다', () => {
    const s = createInitialDrawState()
    expect(s.pots[1]).toHaveLength(9)
    expect(s.pots[2]).toHaveLength(12)
    expect(s.pots[3]).toHaveLength(12)
    expect(s.pots[4]).toHaveLength(12)
  })
})

describe('drawEngine — 배정 규칙', () => {
  it('같은 대륙연맹은 조당 1팀(UEFA만 2팀)까지 허용한다', () => {
    const s = createInitialDrawState()
    // A조에 UEFA 팀 하나 넣고, 두 번째 UEFA는 허용/세 번째는 불가
    s.groups.A[1] = 'ESP' // UEFA
    expect(isValidPlacement('FRA', 'A', s.groups)).toBe(true) // 두 번째 UEFA 허용
    s.groups.A[2] = 'FRA'
    expect(isValidPlacement('GER', 'A', s.groups)).toBe(false) // 세 번째 UEFA 불가
    // CONMEBOL은 1팀까지
    s.groups.C[1] = 'BRA'
    expect(isValidPlacement('ARG', 'C', s.groups)).toBe(false)
  })
})

describe('drawEngine — 전체 조추첨 완성', () => {
  it('끝까지 뽑으면 12개 조가 4팀씩 채워지고 대륙연맹 제약을 만족한다', () => {
    let state = createInitialDrawState()
    let guard = 0
    while (!isDrawComplete(state) && guard < 100) {
      const res = drawNext(state)
      if (!res) break
      state = res.state
      guard++
    }
    expect(isDrawComplete(state)).toBe(true)

    for (const g of GROUP_LETTERS) {
      const teams = state.groups[g].filter(Boolean) as string[]
      expect(teams).toHaveLength(4)
      const byConfed: Record<string, number> = {}
      for (const id of teams) {
        const c = TEAMS_BY_ID[id].confederation
        byConfed[c] = (byConfed[c] ?? 0) + 1
      }
      for (const [confed, count] of Object.entries(byConfed)) {
        expect(count).toBeLessThanOrEqual(confed === 'UEFA' ? 2 : 1)
      }
    }
  })
})

describe('runSeededDraw — 시드 재현성 (C6)', () => {
  it('같은 시드는 완전히 동일한 조 편성을 만든다', () => {
    const a = runSeededDraw('WC2026-DEMO')
    const b = runSeededDraw('WC2026-DEMO')
    expect(a.state.groups).toEqual(b.state.groups)
    expect(a.log).toEqual(b.log)
    expect(isDrawComplete(a.state)).toBe(true)
  })

  it('다른 시드는 (거의 항상) 다른 편성을 만든다', () => {
    const a = runSeededDraw('SEED-ONE')
    const b = runSeededDraw('SEED-TWO')
    expect(a.state.groups).not.toEqual(b.state.groups)
  })

  it('시드 조추첨도 대륙연맹 제약을 만족한다', () => {
    const { state } = runSeededDraw('CONSTRAINT-CHECK')
    for (const g of GROUP_LETTERS) {
      const teams = state.groups[g].filter(Boolean) as string[]
      expect(teams).toHaveLength(4)
      const byConfed: Record<string, number> = {}
      for (const id of teams) {
        const c = TEAMS_BY_ID[id].confederation
        byConfed[c] = (byConfed[c] ?? 0) + 1
      }
      for (const [confed, count] of Object.entries(byConfed)) {
        expect(count).toBeLessThanOrEqual(confed === 'UEFA' ? 2 : 1)
      }
    }
  })
})
