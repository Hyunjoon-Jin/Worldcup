import { describe, expect, it } from 'vitest'
import { cupScheduleDays } from '../src/engine/continental/cupSchedule'
import { runCup } from '../src/engine/continental/runCup'
import { cupTotalStages } from '../src/store/useContinentalStore'
import { CUP_FORMATS, type CupId } from '../src/data/continental/formats'
import { nationsByConfederation, baseRatingsMap } from '../src/data/nations'

function fieldFor(cupId: CupId) {
  const f = CUP_FORMATS[cupId]
  const pool = [...new Set(f.confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))]
  const ratings = baseRatingsMap(pool)
  const teamIds = pool.sort((a, b) => ratings[b].overall - ratings[a].overall || a.localeCompare(b)).slice(0, f.teams)
  return { teamIds, ratings: baseRatingsMap(teamIds) }
}

describe('대륙컵 일·시간대 편성 cupScheduleDays', () => {
  it('days.length = cupTotalStages, 조별 3일 + 녹아웃 라운드, 각 날 시간대별 경기 묶음', () => {
    for (const cupId of ['EURO', 'GOLD', 'ASIAN', 'AFCON', 'OFC'] as CupId[]) {
      const f = CUP_FORMATS[cupId]
      const { teamIds, ratings } = fieldFor(cupId)
      const result = runCup(f, teamIds, ratings, [teamIds[0]], `SCHED-${cupId}`)
      const days = cupScheduleDays(result, f, cupId, 2031)
      expect(days.length).toBe(cupTotalStages(cupId))
      // 조별 3일(Day 1~3) + 녹아웃 라운드 수
      expect(days.filter((d) => d.kind === 'group').length).toBe(3)
      expect(days.filter((d) => d.kind === 'knockout').length).toBe(f.knockout.length)
      // 각 조별 날은 조마다 2경기(4팀 라운드로빈 = 매치데이당 2경기) → groups*2개, 시간대(≤4)로 분산
      for (const d of days.filter((x) => x.kind === 'group')) {
        const total = d.slots.reduce((n, s) => n + s.group.length, 0)
        expect(total).toBe(f.groups * 2)
        expect(d.slots.length).toBeGreaterThan(0)
        expect(d.slots.length).toBeLessThanOrEqual(4)
      }
      // 녹아웃 날은 그 라운드 경기가 시간대로 분산(최종일은 3·4위전 포함 가능)
      const koTotal = days.filter((x) => x.kind === 'knockout').reduce((n, d) => n + d.slots.reduce((k, s) => k + s.ko.length, 0), 0)
      const expectedKo = result.knockout.filter((m) => m.round !== 'THIRD').length + (f.thirdPlace ? result.knockout.filter((m) => m.round === 'THIRD').length : 0)
      expect(koTotal).toBe(expectedKo)
      // stageIndex는 0..total-1 연속
      days.forEach((d, i) => expect(d.stageIndex).toBe(i))
    }
  })
})
