import { FINAL_SLOT_ID } from '../data/bracketTemplate'
import type { KnockoutSlotState } from './tournamentSimulation'

/** 토너먼트에서 도달한 라운드를 단계 값으로 매핑한다(깊을수록 큼). */
const ROUND_STAGE: Record<string, number> = { R32: 1, R16: 2, QF: 3, SF: 4, THIRD: 4, FINAL: 5 }

/**
 * 방금 끝난 본선 성적을 팀별 "커리어 폼" 보정으로 환산한다(커리어 모드 — 다음 대회로 흐름 이어가기).
 * 깊이 진출할수록 큰 +보정을 준다: 우승 +8, 준우승 +6, 4강 +4, 8강 +2, 16강 +1, 32강 0.
 * 이 값은 useCareerStore.advanceEdition에서 감쇠(×0.5)되어 다음 대회 시작 전력에 반영된다.
 */
export function finalsFormDeltas(
  knockoutSlots: Record<string, KnockoutSlotState>,
  champion: string | null,
): Record<string, number> {
  // 팀별로 도달한 가장 깊은 라운드를 구한다.
  const deepest: Record<string, number> = {}
  for (const slot of Object.values(knockoutSlots)) {
    const stage = ROUND_STAGE[slot.round] ?? 0
    for (const t of [slot.team1Id, slot.team2Id]) {
      if (t) deepest[t] = Math.max(deepest[t] ?? 0, stage)
    }
  }

  const STAGE_DELTA: Record<number, number> = { 5: 6, 4: 4, 3: 2, 2: 1, 1: 0 }
  const deltas: Record<string, number> = {}
  for (const [team, stage] of Object.entries(deepest)) {
    deltas[team] = STAGE_DELTA[stage] ?? 0
  }

  // 결승 진출 두 팀: 우승 +8, 준우승 +6.
  const finalResult = knockoutSlots[FINAL_SLOT_ID]?.result
  if (finalResult) {
    const runnerUp = finalResult.winnerTeamId === finalResult.homeTeamId ? finalResult.awayTeamId : finalResult.homeTeamId
    deltas[runnerUp] = 6
  }
  if (champion) deltas[champion] = 8

  return deltas
}
