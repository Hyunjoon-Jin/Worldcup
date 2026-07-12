import { describe, expect, it, beforeEach } from 'vitest'
import { useCareerStore } from '../src/store/useCareerStore'
import { useProgressStore } from '../src/store/useProgressStore'
import { useQualificationStore } from '../src/store/useQualificationStore'
import { advanceToNextEdition } from '../src/store/tournamentActions'
import { getCurrentHostIds } from '../src/engine/hostContext'
import { basePointsFromRank } from '../src/engine/qualification/ranking'
import { ALL_NATIONS_BY_ID } from '../src/data/nations'
import type { KnockoutMatch } from '../src/types/match'

function completedFinals(champion: string, runnerUp: string) {
  const result: KnockoutMatch = {
    round: 'FINAL',
    slotId: 'FINAL',
    homeTeamId: champion,
    awayTeamId: runnerUp,
    homeGoals: 2,
    awayGoals: 1,
    wentToPenalties: false,
    winnerTeamId: champion,
  }
  return {
    phase: 'complete' as const,
    champion,
    knockoutSlots: {
      FINAL: { slotId: 'FINAL', round: 'FINAL' as const, team1Id: champion, team2Id: runnerUp, result },
    },
  }
}

describe('advanceToNextEdition — 다음 대회로 흐름 이어가기', () => {
  beforeEach(() => {
    useCareerStore.getState().reset()
    useQualificationStore.getState().reset()
    useProgressStore.getState().reset()
  })

  it('본선 완료 상태에서 넘어가면 개최국·연도가 바뀌고 새 예선이 시작된다', () => {
    expect(useCareerStore.getState().year).toBe(2026)
    expect([...getCurrentHostIds()].sort()).toEqual(['CAN', 'MEX', 'USA'])

    useProgressStore.setState(completedFinals('BRA', 'ARG'))
    advanceToNextEdition()

    // 다음 대회(2030) + 새 개최국(ESP·POR·MAR)
    expect(useCareerStore.getState().year).toBe(2030)
    expect(useCareerStore.getState().hostIds).toEqual(['ESP', 'POR', 'MAR'])
    expect([...getCurrentHostIds()].sort()).toEqual(['ESP', 'MAR', 'POR'])

    // 우승팀 커리어 폼 누적(우승 +8 → ×0.5 = 4), 준우승(+6 → 3)
    expect(useCareerStore.getState().carriedForm['BRA']).toBe(4)
    expect(useCareerStore.getState().carriedForm['ARG']).toBe(3)

    // 새 예선이 시작됐고 새 개최국이 본선 48에 포함된다
    const result = useQualificationStore.getState().result
    expect(result).not.toBeNull()
    expect(result!.qualified48).toHaveLength(48)
    for (const h of ['ESP', 'POR', 'MAR']) expect(result!.qualified48).toContain(h)

    // 이전 본선 진행은 초기화된다
    expect(useProgressStore.getState().phase).not.toBe('complete')
    expect(useProgressStore.getState().champion).toBeNull()
  })

  it('본선까지 반영된 FIFA 점수가 다음 대회로 이월된다(회귀하지 않는다)', () => {
    // 실제 흐름처럼 예선 결과가 있어야 이번 대회 점수를 계산해 이월할 수 있다.
    useQualificationStore.getState().simulate('CARRY-TEST')
    useProgressStore.setState(completedFinals('BRA', 'ARG'))
    advanceToNextEdition()
    const carried = useCareerStore.getState().rankingBase
    // 이월 점수가 저장되었고, 우승국(BRA)의 이월 점수는 정적 기본값보다 높다(본선 성적 반영).
    expect(Object.keys(carried).length).toBeGreaterThan(0)
    const braCarried = carried['BRA']
    const braStatic = basePointsFromRank(ALL_NATIONS_BY_ID['BRA'].fifaRankApprox)
    expect(braCarried).toBeGreaterThan(braStatic)
  })

  it('본선이 끝나지 않았으면 아무 것도 하지 않는다', () => {
    useProgressStore.setState({ phase: 'group', champion: null })
    advanceToNextEdition()
    expect(useCareerStore.getState().year).toBe(2026)
    expect(useCareerStore.getState().hostIds).toEqual(['MEX', 'CAN', 'USA'])
  })

  it('reset(clearAllHistory 경유)으로 커리어가 2026으로 되돌아간다', () => {
    useProgressStore.setState(completedFinals('FRA', 'ENG'))
    advanceToNextEdition()
    expect(useCareerStore.getState().editionIndex).toBe(1)
    useCareerStore.getState().reset()
    expect(useCareerStore.getState().editionIndex).toBe(0)
    expect(useCareerStore.getState().year).toBe(2026)
    expect([...getCurrentHostIds()].sort()).toEqual(['CAN', 'MEX', 'USA'])
  })
})
