import { describe, expect, it } from 'vitest'
import { useDrawStore } from '../src/store/useDrawStore'
import { simulateAllQualification } from '../src/engine/qualification'

describe('순차 조추첨 (prepareFromField)', () => {
  it('prepareFromField: 개최국 사전 배치 + 포트 구성, 추첨은 아직 미완료', () => {
    const all = simulateAllQualification('DRAW-SEQ')
    useDrawStore.getState().prepareFromField(all.qualified48)
    const s = useDrawStore.getState()
    expect(s.isComplete).toBe(false)
    expect(s.fieldTeams).toEqual(all.qualified48)
    expect(s.log).toHaveLength(0)
    // 개최국이 각 조 1번 시드에 사전 배치된다.
    expect(s.state.groups.A[0]).toBeTruthy()
    // 포트 풀이 채워져 있다(비개최 45국).
    const potCount = [1, 2, 3, 4].reduce((n, p) => n + s.state.pots[p as 1 | 2 | 3 | 4].length, 0)
    expect(potCount).toBeGreaterThan(40)
  })

  it('prepareFromField 후 drawOne을 반복하면 12개 조가 완성된다', () => {
    const all = simulateAllQualification('DRAW-SEQ2')
    useDrawStore.getState().prepareFromField(all.qualified48)
    let guard = 0
    while (!useDrawStore.getState().isComplete && guard < 100) {
      useDrawStore.getState().drawOne()
      guard++
    }
    const s = useDrawStore.getState()
    expect(s.isComplete).toBe(true)
    const placed = Object.values(s.state.groups).flat().filter(Boolean) as string[]
    expect(placed).toHaveLength(48)
  })

  it('drawFromSeed는 준비된 48개국(fieldTeams)으로만 추첨한다', () => {
    const all = simulateAllQualification('DRAW-SEQ3')
    useDrawStore.getState().prepareFromField(all.qualified48)
    useDrawStore.getState().drawFromSeed('SEEDX')
    const s = useDrawStore.getState()
    expect(s.isComplete).toBe(true)
    const placed = Object.values(s.state.groups).flat().filter(Boolean) as string[]
    const field = new Set(all.qualified48)
    for (const id of placed) expect(field.has(id)).toBe(true)
    expect(placed).toHaveLength(48)
  })
})
