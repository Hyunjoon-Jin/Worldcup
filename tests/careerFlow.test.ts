import { describe, expect, it, beforeEach } from 'vitest'
import { useCareerStore } from '../src/store/useCareerStore'
import { useProgressStore } from '../src/store/useProgressStore'
import { useQualificationStore } from '../src/store/useQualificationStore'
import { advanceToNextEdition, clearAllHistory } from '../src/store/tournamentActions'
import { autoSimulateCup } from '../src/store/seasonActions'
import { useHistoryStore } from '../src/store/useHistoryStore'
import { useContinentalHistoryStore } from '../src/store/useContinentalHistoryStore'
import { useContinentalStore } from '../src/store/useContinentalStore'
import { getCurrentHostIds } from '../src/engine/hostContext'
import { editionEndRankingPoints } from '../src/engine/qualification/ranking'
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
    // 개최국 자동 진출 대상이 새 개최국으로 바뀐다(이전 개최국은 자동 진출 아님).
    expect([...result!.hosts].sort()).toEqual(['ESP', 'MAR', 'POR'])
    // 이전 개최국(USA·MEX·CAN)은 이제 자동 진출이 아니라 소속 대륙(CONCACAF) 예선을 치른다.
    const concacafPlayers = new Set(
      result!.byConfederation.CONCACAF.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]),
    )
    for (const old of ['USA', 'MEX', 'CAN']) expect(result!.hosts).not.toContain(old)
    expect([...concacafPlayers].some((id) => ['USA', 'MEX', 'CAN'].includes(id))).toBe(true)

    // 이전 본선 진행은 초기화된다
    expect(useProgressStore.getState().phase).not.toBe('complete')
    expect(useProgressStore.getState().champion).toBeNull()
  })

  it('본선까지 반영된 FIFA 점수가 다음 대회로 이월된다(본선 성적 반영)', () => {
    // 실제 흐름처럼 예선 결과가 있어야 이번 대회 점수를 계산해 이월할 수 있다.
    useQualificationStore.getState().simulate('CARRY-TEST')
    useProgressStore.setState(completedFinals('BRA', 'ARG'))
    advanceToNextEdition()
    const carried = useCareerStore.getState().rankingBase
    // 이월 점수가 실제로 저장된다.
    expect(Object.keys(carried).length).toBeGreaterThan(0)
    // 본선 성적이 이월 점수에 '반영'된다 = 결승에서 이겼을 때 이월 점수가 졌을 때보다 높다.
    // (예선 성적은 시드 운에 좌우되므로 '정적 기본값 초과'가 아니라 결승 결과의 반영 여부로 검증한다.)
    const all = useQualificationStore.getState().result!
    const finalOf = (winner: string, loser: string): KnockoutMatch => ({
      round: 'FINAL', slotId: 'FINAL', homeTeamId: winner, awayTeamId: loser, homeGoals: 2, awayGoals: 1, wentToPenalties: false, winnerTeamId: winner,
    })
    const braWins = editionEndRankingPoints(all, { groupMatches: [], knockoutMatches: [finalOf('BRA', 'ARG')] })
    const braLoses = editionEndRankingPoints(all, { groupMatches: [], knockoutMatches: [finalOf('ARG', 'BRA')] })
    expect(braWins['BRA']).toBeGreaterThan(braLoses['BRA'])
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

  it('clearAllHistory는 팀별 역대 기록(useHistoryStore)도 함께 삭제한다', () => {
    // 대회를 마치고 다음 대회로 넘어가면 역대 기록이 쌓인다.
    useProgressStore.setState(completedFinals('BRA', 'ARG'))
    advanceToNextEdition()
    expect(useHistoryStore.getState().editions.length).toBeGreaterThan(0)
    // 진행 이력 전체 삭제 시 역대 기록도 비워져야 한다.
    clearAllHistory()
    expect(useHistoryStore.getState().editions).toEqual([])
  })

  it('clearAllHistory는 대륙컵 역대 기록(트로피·통산)도 함께 삭제한다(회귀 방지)', () => {
    // 대륙컵을 진행하면 대륙컵 역대 기록이 쌓인다.
    autoSimulateCup('EURO', 2028, 'CLEAR-TEST')
    expect(useContinentalHistoryStore.getState().editions.length).toBeGreaterThan(0)
    // '전체 삭제'는 대륙컵 진행/역대 기록도 반드시 비워야 한다(이전엔 누락돼 남아 있었음).
    clearAllHistory()
    expect(useContinentalHistoryStore.getState().editions).toEqual([])
    expect(useContinentalStore.getState().result).toBeNull()
    expect(useContinentalStore.getState().activeCupId).toBeNull()
  })
})
