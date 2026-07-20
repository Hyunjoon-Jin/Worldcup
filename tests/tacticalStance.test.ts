import { describe, it, expect, beforeEach } from 'vitest'
import { getRatings } from '../src/engine/matchEngine'
import { useMyTeamStore } from '../src/store/useMyTeamStore'
import { ALL_NATIONS } from '../src/data/nations'

// 중위권 팀(클램프 경계 회피)을 하나 고른다.
const midTeam = ALL_NATIONS.find((n) => n.baseRatings.attack > 50 && n.baseRatings.attack < 90 && n.baseRatings.defense > 50 && n.baseRatings.defense < 90)!.id

describe('전술 스탠스(감독 결정권)', () => {
  beforeEach(() => useMyTeamStore.setState({ myTeamId: null, buff: 0, stance: 'balanced' }))

  it('내 팀에만 적용된다(다른 팀은 불변)', () => {
    const before = getRatings(midTeam)
    useMyTeamStore.setState({ myTeamId: 'ZZZ-NOT-A-TEAM', stance: 'attacking' })
    const after = getRatings(midTeam)
    expect(after.attack).toBe(before.attack)
  })

  it('공격적: 공격↑·수비↓, 종합 불변', () => {
    useMyTeamStore.setState({ myTeamId: midTeam, stance: 'balanced' })
    const bal = getRatings(midTeam)
    useMyTeamStore.setState({ stance: 'attacking' })
    const atk = getRatings(midTeam)
    expect(atk.attack).toBe(bal.attack + 4)
    expect(atk.defense).toBe(bal.defense - 4)
    expect(atk.overall).toBe(bal.overall)
  })

  it('수비적: 공격↓·수비↑, 종합 불변', () => {
    useMyTeamStore.setState({ myTeamId: midTeam, stance: 'balanced' })
    const bal = getRatings(midTeam)
    useMyTeamStore.setState({ stance: 'defensive' })
    const def = getRatings(midTeam)
    expect(def.attack).toBe(bal.attack - 4)
    expect(def.defense).toBe(bal.defense + 4)
    expect(def.overall).toBe(bal.overall)
  })
})
