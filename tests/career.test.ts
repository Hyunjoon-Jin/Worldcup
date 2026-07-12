import { describe, expect, it } from 'vitest'
import { hostEditionAt, HOST_ROTATION } from '../src/data/hostRotation'
import { finalsFormDeltas } from '../src/engine/finalsForm'
import { ALL_NATIONS_BY_ID } from '../src/data/nations'
import type { KnockoutSlotState } from '../src/engine/tournamentSimulation'
import type { KnockoutMatch } from '../src/types/match'

describe('hostRotation — 개최국 로테이션', () => {
  it('인덱스 0은 2026 북중미 3국', () => {
    expect(hostEditionAt(0)).toEqual({ year: 2026, hostIds: ['MEX', 'CAN', 'USA'] })
  })

  it('로테이션을 순환하되 연도는 계속 증가한다', () => {
    const len = HOST_ROTATION.length
    const first = hostEditionAt(0)
    const wrapped = hostEditionAt(len)
    // 개최국은 한 바퀴 뒤 동일하지만 연도는 +(len*4) 증가
    expect(wrapped.hostIds).toEqual(first.hostIds)
    expect(wrapped.year).toBe(first.year + len * 4)
  })

  it('모든 로테이션 개최국 ID는 실재하는 팀이다', () => {
    for (const ed of HOST_ROTATION) {
      for (const id of ed.hostIds) {
        expect(ALL_NATIONS_BY_ID[id], `${id} should exist`).toBeTruthy()
      }
    }
  })
})

describe('finalsFormDeltas — 본선 성적 → 커리어 폼', () => {
  function slot(round: KnockoutSlotState['round'], t1: string | null, t2: string | null, winner?: string): KnockoutSlotState {
    const result: KnockoutMatch | null =
      winner != null
        ? {
            round,
            slotId: `${round}-x`,
            homeTeamId: t1!,
            awayTeamId: t2!,
            homeGoals: winner === t1 ? 1 : 0,
            awayGoals: winner === t2 ? 1 : 0,
            wentToPenalties: false,
            winnerTeamId: winner,
          }
        : null
    return { slotId: `${round}-x`, round, team1Id: t1, team2Id: t2, result }
  }

  it('우승 +8, 준우승 +6, 4강 +4, 8강 +2, 16강 +1', () => {
    const slots: Record<string, KnockoutSlotState> = {
      // 16강: R16 진출팀
      R16A: slot('R16', 'R16LOSER', 'QFA', 'QFA'),
      // 8강: QF 패배팀
      QFA: slot('QF', 'QFA', 'SFA', 'SFA'),
      // 4강: SF 패배팀
      SFA: slot('SF', 'SFA', 'CHAMP', 'CHAMP'),
      // 결승: 우승/준우승
      FINAL: slot('FINAL', 'CHAMP', 'RUNNER', 'CHAMP'),
    }
    const deltas = finalsFormDeltas(slots, 'CHAMP')
    expect(deltas['CHAMP']).toBe(8)
    expect(deltas['RUNNER']).toBe(6)
    expect(deltas['SFA']).toBe(4)
    expect(deltas['QFA']).toBe(2)
    expect(deltas['R16LOSER']).toBe(1)
  })

  it('우승팀이 없으면(미완료) 결승 진출 두 팀에만 준우승/결승 보정을 준다', () => {
    const slots: Record<string, KnockoutSlotState> = {
      FINAL: slot('FINAL', 'A', 'B'), // 아직 결과 없음
    }
    const deltas = finalsFormDeltas(slots, null)
    // 결승 결과가 없으므로 준우승 판정 불가 — 두 팀은 FINAL 단계(=우승 자리) 기본 +6
    expect(deltas['A']).toBe(6)
    expect(deltas['B']).toBe(6)
  })
})
