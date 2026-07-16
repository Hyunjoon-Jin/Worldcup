import { describe, expect, it, beforeEach } from 'vitest'
import {
  autoSimulateCup,
  autoSimulateWorldCupFinals,
  autoAdvanceCycle,
  isCupSimulated,
  isWorldCupFinalsComplete,
} from '../src/store/seasonActions'
import { useContinentalStore } from '../src/store/useContinentalStore'
import { useContinentalHistoryStore } from '../src/store/useContinentalHistoryStore'
import { useProgressStore } from '../src/store/useProgressStore'
import { useQualificationStore } from '../src/store/useQualificationStore'
import { useCareerStore } from '../src/store/useCareerStore'
import { useSeasonStore } from '../src/store/useSeasonStore'
import { useHistoryStore } from '../src/store/useHistoryStore'

function resetAll() {
  useCareerStore.getState().reset()
  useQualificationStore.getState().reset()
  useProgressStore.getState().reset()
  useContinentalStore.getState().reset()
  useContinentalHistoryStore.getState().reset()
  useSeasonStore.getState().reset()
  useHistoryStore.getState().reset()
}

describe('seasonActions — 일정 축 자동 진행', () => {
  beforeEach(resetAll)

  it('autoSimulateCup: 대륙컵을 자동 시뮬레이션해 그 연도 대회를 기록한다', () => {
    expect(isCupSimulated('EURO', 2028)).toBe(false)
    autoSimulateCup('EURO', 2028)
    expect(isCupSimulated('EURO', 2028)).toBe(true)
    const ed = useContinentalHistoryStore.getState().editions.find((e) => e.cupId === 'EURO' && e.year === 2028)
    expect(ed).toBeDefined()
    expect(ed!.champion).toBeTruthy()
    expect(ed!.qualified.length).toBeGreaterThan(0)
  })

  it('autoSimulateCup: 이미 기록된 대회는 중복 시뮬레이션하지 않는다(멱등)', () => {
    autoSimulateCup('EURO', 2028, 'SEED-A')
    const first = useContinentalHistoryStore.getState().editions.filter((e) => e.cupId === 'EURO' && e.year === 2028)
    autoSimulateCup('EURO', 2028, 'SEED-B')
    const second = useContinentalHistoryStore.getState().editions.filter((e) => e.cupId === 'EURO' && e.year === 2028)
    expect(second.length).toBe(first.length)
    expect(second[0].champion).toBe(first[0].champion)
  })

  it('autoSimulateWorldCupFinals: 예선부터 본선까지 자동 진행해 우승팀을 확정한다', () => {
    expect(isWorldCupFinalsComplete()).toBe(false)
    autoSimulateWorldCupFinals('WC-2026')
    expect(isWorldCupFinalsComplete()).toBe(true)
    expect(useProgressStore.getState().champion).toBeTruthy()
  })

  it('autoSimulateWorldCupFinals: 이미 완료된 본선은 다시 시뮬레이션하지 않는다(멱등)', () => {
    autoSimulateWorldCupFinals('WC-2026')
    const champ = useProgressStore.getState().champion
    autoSimulateWorldCupFinals('WC-2026')
    expect(useProgressStore.getState().champion).toBe(champ)
  })

  it('autoAdvanceCycle: 사이클 전체를 자동 진행하고 다음 월드컵 사이클로 넘어간다', () => {
    expect(useCareerStore.getState().year).toBe(2026)
    autoAdvanceCycle()
    // 커리어가 다음 사이클(2030)로 롤 + 커서 리셋
    expect(useCareerStore.getState().year).toBe(2030)
    expect(useSeasonStore.getState().cursorIndex).toBe(0)
    // 월드컵 본선이 역대 기록에 축적됨(2026 대회)
    expect(useHistoryStore.getState().editions.some((e) => e.year === 2026)).toBe(true)
    // 이번 사이클의 대륙컵들이 기록됨(유로 2028·아시안컵 2027 등)
    const cupEds = useContinentalHistoryStore.getState().editions
    expect(cupEds.some((e) => e.cupId === 'EURO' && e.year === 2028)).toBe(true)
    expect(cupEds.some((e) => e.cupId === 'ASIAN' && e.year === 2027)).toBe(true)
    // 골드컵은 사이클 내 2회(2027·2029) 모두 기록
    expect(cupEds.filter((e) => e.cupId === 'GOLD').map((e) => e.year).sort()).toEqual([2027, 2029])
  })
})
