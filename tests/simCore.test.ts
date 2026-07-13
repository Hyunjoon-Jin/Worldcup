import { describe, expect, it } from 'vitest'
import { createSimulationAccumulator, simulateFullTournament, type SimSnapshot } from '../src/engine/simCore'
import { runSeededDraw } from '../src/engine/drawEngine'
import { buildFullSchedule } from '../src/engine/scheduleEngine'
import { createSeededRandom } from '../src/engine/rng'
import { TEAMS } from '../src/data/teams'
import { FINAL_SLOT_ID } from '../src/data/bracketTemplate'

function makeSnapshot(seed = 'SIMCORE-TEST'): SimSnapshot {
  const draw = runSeededDraw(seed)
  const schedule = buildFullSchedule()
  return {
    drawGroups: draw.state.groups,
    scheduleGroupMatches: schedule.groupMatches,
    lockedGroupMatches: [],
    lockedKnockoutResults: {},
    ratings: Object.fromEntries(TEAMS.map((t) => [t.id, t.baseRatings])),
  }
}

describe('simCore — 순수 스냅샷 시뮬레이션 (v2 #42)', () => {
  it('한 번의 전체 대회는 항상 챔피언을 배출한다', () => {
    const snap = makeSnapshot()
    const { slots } = simulateFullTournament(snap, createSeededRandom('one'))
    expect(slots[FINAL_SLOT_ID].result?.winnerTeamId).toBeTruthy()
  })

  it('우승 확률의 합은 100%에 수렴한다(매 회차 챔피언 1명)', () => {
    const snap = makeSnapshot()
    const acc = createSimulationAccumulator(snap, createSeededRandom('agg'))
    acc.runBatch(400)
    const result = acc.result(0)
    const sum = Object.values(result.probabilities).reduce((s, p) => s + p.championPct, 0)
    expect(sum).toBeCloseTo(100, 0)
  })

  it('매 회차 정확히 32팀이 조별 통과한다(합 ≈ 3200%p)', () => {
    const snap = makeSnapshot()
    const acc = createSimulationAccumulator(snap, createSeededRandom('grp'))
    acc.runBatch(200)
    const result = acc.result(0)
    const sum = Object.values(result.probabilities).reduce((s, p) => s + p.groupStagePct, 0)
    expect(sum).toBeCloseTo(3200, 0)
  })

  it('강팀의 우승 확률이 약팀보다 높다', () => {
    const snap = makeSnapshot()
    const acc = createSimulationAccumulator(snap, createSeededRandom('strength'))
    acc.runBatch(500)
    const result = acc.result(0)
    expect(result.probabilities.ARG.championPct).toBeGreaterThan(result.probabilities.CUW.championPct)
  })
})
