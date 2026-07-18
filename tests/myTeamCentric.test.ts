import { describe, it, expect } from 'vitest'
import { myTeamInCup } from '../src/store/seasonActions'

describe('내 팀 중심 진행 — myTeamInCup 참가 판정', () => {
  it('AFC 팀(대한민국)은 아시안컵 참가국이고, 유로·코파·골드컵 참가국이 아니다', () => {
    expect(myTeamInCup('KOR', 'ASIAN', 2027)).toBe(true)
    expect(myTeamInCup('KOR', 'EURO', 2028)).toBe(false)
    expect(myTeamInCup('KOR', 'COPA', 2028)).toBe(false)
    expect(myTeamInCup('KOR', 'GOLD', 2027)).toBe(false)
    expect(myTeamInCup('KOR', 'AFCON', 2027)).toBe(false)
  })

  it('UEFA 팀(프랑스)은 유로 참가국이고, 아시안컵·아프리카컵 참가국이 아니다', () => {
    expect(myTeamInCup('FRA', 'EURO', 2028)).toBe(true)
    expect(myTeamInCup('FRA', 'ASIAN', 2027)).toBe(false)
    expect(myTeamInCup('FRA', 'AFCON', 2027)).toBe(false)
  })

  it('CONMEBOL 팀(브라질)은 코파 참가국이고, 유로 참가국이 아니다', () => {
    expect(myTeamInCup('BRA', 'COPA', 2028)).toBe(true)
    expect(myTeamInCup('BRA', 'EURO', 2028)).toBe(false)
  })

  it('약체 AFC 팀도 확대된 아시안컵(24팀) 안이면 참가로 잡힌다(연맹 불일치만 확실히 배제)', () => {
    // 존재하지 않는 팀 id는 연맹을 못 찾아 false.
    expect(myTeamInCup('___NOPE___', 'ASIAN', 2027)).toBe(false)
  })
})
