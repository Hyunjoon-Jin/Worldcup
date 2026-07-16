import { describe, expect, it } from 'vitest'
import { buildSeasonTimeline, eventsSharePossibleTeam, windowsOverlap, addDays } from '../src/engine/season/seasonTimeline'

describe('시즌 타임라인 + 충돌 불변식 (요구 ① 일정 충돌 방지)', () => {
  it('사이클마다 월드컵 1 + 대륙컵 7개 인스턴스(골드컵 2회)', () => {
    const evs = buildSeasonTimeline(2026)
    expect(evs.filter((e) => e.kind === 'wc')).toHaveLength(1)
    const cupInstances = evs.filter((e) => e.kind === 'cup')
    expect(cupInstances).toHaveLength(7) // EURO·COPA·AFCON·ASIAN·OFC 각1 + GOLD 2
    expect(cupInstances.filter((e) => e.id === 'GOLD')).toHaveLength(2)
  })

  it('불변식: 같은 팀이 참가 가능한 두 대회는 날짜가 겹치지 않는다(어떤 wcYear에서도)', () => {
    for (const wcYear of [2026, 2030, 2034]) {
      const evs = buildSeasonTimeline(wcYear)
      for (let i = 0; i < evs.length; i++) {
        for (let j = i + 1; j < evs.length; j++) {
          if (eventsSharePossibleTeam(evs[i], evs[j]) && windowsOverlap(evs[i], evs[j])) {
            throw new Error(`충돌: ${evs[i].nameKo}(${evs[i].start}~${evs[i].end}) ↔ ${evs[j].nameKo}(${evs[j].start}~${evs[j].end})`)
          }
        }
      }
    }
    expect(true).toBe(true)
  })

  it('월드컵 본선은 wcYear 여름, 아시안컵은 이듬해 1월', () => {
    const evs = buildSeasonTimeline(2026)
    const wc = evs.find((e) => e.id === 'WC')!
    expect(wc.start.startsWith('2026-06')).toBe(true)
    const asian = evs.find((e) => e.id === 'ASIAN')!
    expect(asian.start.startsWith('2027-01')).toBe(true)
  })

  it('유로·코파는 wcYear+2 여름, 골드컵은 홀수년(wcYear+1·+3)', () => {
    const evs = buildSeasonTimeline(2026)
    expect(evs.find((e) => e.id === 'EURO')!.year).toBe(2028)
    expect(evs.find((e) => e.id === 'COPA')!.year).toBe(2028)
    expect(evs.filter((e) => e.id === 'GOLD').map((e) => e.year).sort()).toEqual([2027, 2029])
  })

  it('연도 이동은 결정론적(2030 사이클도 동일 구조)', () => {
    const a = buildSeasonTimeline(2026).map((e) => `${e.id}|${e.start.slice(5)}`)
    const b = buildSeasonTimeline(2030).map((e) => `${e.id}|${e.start.slice(5)}`)
    expect(a).toEqual(b) // 월/일 구조 동일, 연도만 이동
  })

  it('addDays는 UTC 결정론적', () => {
    expect(addDays('2026-06-14', 30)).toBe('2026-07-14')
    expect(addDays('2026-12-21', 28)).toBe('2027-01-18')
  })
})
