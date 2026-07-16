import { useProgressStore } from './useProgressStore'
import { useQualificationStore } from './useQualificationStore'
import { useContinentalStore } from './useContinentalStore'
import { useContinentalHistoryStore } from './useContinentalHistoryStore'
import { useCareerStore } from './useCareerStore'
import { useSeasonStore } from './useSeasonStore'
import { startFinalsFromQualification, advanceToNextEdition } from './tournamentActions'
import { formOffsetsFromResults } from '../engine/qualification/ranking'
import { buildSeasonTimeline, type SeasonEvent } from '../engine/season/seasonTimeline'
import type { CupId } from '../data/continental/formats'

/**
 * 일정(캘린더) 축 진행 액션. 앱은 '월드컵'이 아니라 '일정'을 축으로 전진한다 — 이 모듈은 캘린더 위의
 * 한 이벤트를 자동으로 끝까지 시뮬레이션하고(수동으로 플레이하지 않고 넘길 때), 나아가 한 사이클 전체를
 * 자동 진행(커리어 자동 진행)하는 오케스트레이션을 담당한다. 월드컵 커리어 경계(연도 롤·랭킹/폼 이월)는
 * 기존 advanceToNextEdition을 그대로 재사용해 골든 동작을 건드리지 않는다(사이클 종료 시 1회).
 */

/** 월드컵 본선이 이미 완료됐는지(자동 시뮬 멱등성 판단용). */
export function isWorldCupFinalsComplete(): boolean {
  return useProgressStore.getState().phase === 'complete'
}

/** 특정 대륙컵의 그 연도 대회가 이미 기록됐는지(자동 시뮬 멱등성 판단용). */
export function isCupSimulated(cupId: CupId, year: number): boolean {
  return useContinentalHistoryStore.getState().editions.some((e) => e.cupId === cupId && e.year === year)
}

/**
 * 월드컵을 예선부터 본선 끝까지 자동으로 시뮬레이션한다(커리어 롤은 하지 않음 — 사이클 종료 시 처리).
 * 이미 본선이 완료돼 있으면(사용자가 직접 플레이했으면) 그대로 둔다. 예선 결과가 없으면 먼저 예선을 돌린다.
 * 본선은 예선 통과 48개국으로 즉시 조추첨 → advanceToEnd로 전 경기를 소화해 phase='complete'로 만든다.
 */
export function autoSimulateWorldCupFinals(seed?: string): void {
  if (isWorldCupFinalsComplete()) return
  const qs = useQualificationStore.getState()
  let result = qs.result
  if (!result) {
    qs.simulate(seed)
    result = useQualificationStore.getState().result
  }
  if (!result) return
  startFinalsFromQualification(result.qualified48, seed, formOffsetsFromResults(result))
  useProgressStore.getState().advanceToEnd()
}

/**
 * 대륙컵 한 대회를 자동으로 시뮬레이션한다(예선 → 본선 전과정). 이미 그 연도 대회가 기록돼 있으면 스킵한다.
 * 결과는 useContinentalHistoryStore에 축적되어 팀별 트로피·통산 성적·랭킹에 반영된다.
 */
export function autoSimulateCup(cupId: CupId, year: number, seed?: string): void {
  if (isCupSimulated(cupId, year)) return
  const store = useContinentalStore.getState()
  store.selectCup(cupId, year)
  store.runActiveCup({ seed: seed ?? `${cupId}-${year}` })
  useContinentalStore.getState().advanceToEnd()
}

/** 시즌 이벤트(월드컵/대륙컵) 하나를 자동 시뮬레이션한다. */
export function autoSimulateSeasonEvent(e: SeasonEvent): void {
  if (e.kind === 'wc') autoSimulateWorldCupFinals(`WC-${e.year}`)
  else autoSimulateCup(e.id as CupId, e.year, `${e.id}-${e.year}`)
}

/**
 * 한 사이클(현재 커서 ~ 마지막 일정)을 전부 자동 진행한다(커리어 자동 진행). 남은 모든 이벤트를 순서대로
 * 자동 시뮬레이션한 뒤, 사이클 종료 처리(advanceToNextEdition)로 다음 월드컵 사이클로 넘어가며 폼·FIFA
 * 점수를 이월한다. 커서는 새 사이클의 처음으로 리셋한다.
 */
export function autoAdvanceCycle(): void {
  const wcYear = useCareerStore.getState().year
  const events = buildSeasonTimeline(wcYear)
  const start = Math.min(useSeasonStore.getState().cursorIndex, events.length - 1)
  for (let i = Math.max(0, start); i < events.length; i++) {
    autoSimulateSeasonEvent(events[i])
  }
  // 사이클 종료 → 커리어 롤(연도·개최국·폼·랭킹 이월) + 커서 리셋. 월드컵 본선이 complete여야 롤이 진행된다.
  advanceToNextEdition()
  useSeasonStore.getState().reset()
}
