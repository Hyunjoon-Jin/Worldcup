import { describe, expect, it } from 'vitest'
import {
  buildSeasonTimeline,
  eventsSharePossibleTeam,
  windowsOverlap,
  addDays,
  buildCupPhases,
  buildWcPhases,
  buildEventPhases,
  buildCycleCalendar,
} from '../src/engine/season/seasonTimeline'

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

describe('세부 일정 전개(대륙대회 일정 상세화 + 캘린더)', () => {
  it('대륙컵을 조별 3차전 + 녹아웃 라운드로 날짜와 함께 전개한다', () => {
    // EURO 2028: 개막 2028-06-14. groupDayOffsets [1,6,10], knockout R16:16,QF:22,SF:26,FINAL:31.
    const phases = buildCupPhases('EURO', 2028)
    const group = phases.filter((p) => p.key.startsWith('G'))
    expect(group).toHaveLength(3)
    expect(group[0].start).toBe('2028-06-14') // Day 1 = 개막
    expect(group[1].start).toBe('2028-06-19') // +5
    expect(group[2].start).toBe('2028-06-23') // +9
    const final = phases.find((p) => p.key === 'FINAL')!
    expect(final.start).toBe('2028-07-14') // +30
    // 라운드는 날짜 순서(조별 → 녹아웃)로 정렬
    for (let i = 1; i < phases.length; i++) expect(phases[i - 1].start <= phases[i].start).toBe(true)
  })

  it('3·4위전이 있는 대회는 결승보다 앞선 날짜로 포함된다(AFCON)', () => {
    const phases = buildCupPhases('AFCON', 2027)
    const third = phases.find((p) => p.key === 'THIRD')
    const final = phases.find((p) => p.key === 'FINAL')
    expect(third).toBeDefined()
    expect(final).toBeDefined()
    expect(third!.start <= final!.start).toBe(true)
  })

  it('월드컵 본선은 조별리그 + 32강~결승 라운드창으로 전개된다', () => {
    const phases = buildWcPhases(2026)
    // 지역예선(전년)부터 시작해 조별리그·결승으로 이어진다.
    expect(phases[0].label).toContain('지역예선')
    expect(phases[0].start.startsWith('2025')).toBe(true) // 예선은 개최 전년부터
    expect(phases.some((p) => p.label === '조별리그')).toBe(true)
    expect(phases.some((p) => p.key === 'FINAL')).toBe(true)
    expect(buildEventPhases({ kind: 'wc', id: 'WC', nameKo: 'x', confeds: 'ALL', year: 2026, start: '', end: '' })).toEqual(phases)
  })

  it('사이클 캘린더는 모든 대회의 세부 단계를 대회 컨텍스트와 함께 펼친다', () => {
    const cal = buildCycleCalendar(2026)
    // 월드컵 세부 단계가 포함된다
    expect(cal.some((p) => p.eventKind === 'wc' && p.key === 'FINAL')).toBe(true)
    // 각 대륙컵의 결승도 포함된다(7개 인스턴스)
    expect(cal.filter((p) => p.eventKind === 'cup' && p.key === 'FINAL')).toHaveLength(7)
    // 모든 항목은 대회명을 가진다
    expect(cal.every((p) => p.eventNameKo.length > 0)).toBe(true)
  })
})
