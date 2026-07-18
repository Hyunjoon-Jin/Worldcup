import { useProgressStore } from './useProgressStore'
import { useQualificationStore } from './useQualificationStore'
import { useContinentalStore } from './useContinentalStore'
import { useContinentalHistoryStore } from './useContinentalHistoryStore'
import { useCareerStore } from './useCareerStore'
import { useSeasonStore } from './useSeasonStore'
import { startFinalsFromQualification, advanceToNextEdition } from './tournamentActions'
import { formOffsetsFromResults } from '../engine/qualification/ranking'
import { buildSeasonTimeline, type SeasonEvent } from '../engine/season/seasonTimeline'
import { type CupId } from '../data/continental/formats'

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
 * 월드컵 지역예선 캠페인 순위를 팀→랭킹으로 환산한다(낮을수록 상위). 대륙컵 예선이 '같은 캠페인'을
 * 반영하도록 하는 단일 출처다. 각 대륙 예선의 최종 순위(standings)를 그대로 랭킹으로 쓰므로, 월드컵
 * 예선에서 잘한 순서가 곧 대륙컵 진출 순서가 된다(통합 예선의 실제 원리). 월드컵 본선 직행국은 더
 * 끌어올려(−1000) 최우선한다. 예선 결과가 없으면 빈 맵(엔진이 FIFA 근사 랭킹으로 폴백).
 */
function combinedQualRanking(): Record<string, number> {
  const qr = useQualificationStore.getState().result
  if (!qr) return {}
  const map: Record<string, number> = {}
  // 각 대륙 예선의 실제 최종 순위(1위=1)를 랭킹으로 삼는다 — 월드컵 예선 성적을 그대로 대륙컵에 반영.
  for (const r of Object.values(qr.byConfederation)) {
    r.standings.forEach((id, i) => {
      map[id] = i + 1
    })
  }
  // 월드컵 본선 직행국은 확정적으로 최상위(−1000)로 끌어올려 통합 예선에서 반드시 우대한다.
  for (const id of qr.qualified48) map[id] = (map[id] ?? 999) - 1000
  return map
}

/**
 * 대륙컵 예선에 넘길 '월드컵 캠페인 반영' 랭킹. 통합 예선(combinedWcq: 아시안컵)은 물론, 월드컵 예선
 * 성적이 진출에 반영되는 방식(nationsLeague: 골드컵 등)도 같은 원리로 캠페인 순위를 넘겨준다. 조별 예선을
 * 새로 치르는 대회(EURO·AFCON 등)는 시드 정렬 tiebreak로만 반영되도록 동일하게 넘긴다.
 */
export function cupRankByTeam(_cupId: CupId): Record<string, number> | undefined {
  const rank = combinedQualRanking()
  return Object.keys(rank).length > 0 ? rank : undefined
}

/**
 * 대륙컵 한 대회를 자동으로 시뮬레이션한다(예선 → 본선 전과정). 이미 그 연도 대회가 기록돼 있으면 스킵한다.
 * 결과는 useContinentalHistoryStore에 축적되어 팀별 트로피·통산 성적·랭킹에 반영된다.
 * AFC 아시안컵(combinedWcq)은 월드컵 예선 결과를 반영해 진출국을 가린다(통합 예선).
 */
export function autoSimulateCup(cupId: CupId, year: number, seed?: string): void {
  if (isCupSimulated(cupId, year)) return
  const store = useContinentalStore.getState()
  store.selectCup(cupId, year)
  const rankByTeam = cupRankByTeam(cupId)
  store.runActiveCup({ seed: seed ?? `${cupId}-${year}`, rankByTeam })
  useContinentalStore.getState().advanceToEnd()
}

/** 시즌 이벤트(월드컵/대륙컵) 하나를 자동 시뮬레이션한다. */
export function autoSimulateSeasonEvent(e: SeasonEvent): void {
  if (e.kind === 'wc') autoSimulateWorldCupFinals(`WC-${e.year}`)
  else autoSimulateCup(e.id as CupId, e.year, `${e.id}-${e.year}`)
}

/**
 * 월드컵 본선을 마치고 캘린더로 돌아갈 때: 사이클을 바로 롤(다음 월드컵 예선)하지 않고, 월드컵 다음 일정
 * (대륙컵 등)으로 커서를 옮겨 '남은 사이클'을 캘린더에서 이어가게 한다. 월드컵이 사이클의 마지막 일정일
 * 때만 다음 사이클로 롤한다. (월드컵은 보통 사이클 앞부분이고 아시안컵·유로 등이 뒤에 이어진다.)
 */
export function advanceCalendarAfterWorldCup(): void {
  const wcYear = useCareerStore.getState().year
  const events = buildSeasonTimeline(wcYear)
  const wcIdx = events.findIndex((e) => e.kind === 'wc')
  if (wcIdx < 0 || wcIdx >= events.length - 1) {
    // 월드컵이 마지막이면 사이클 종료 → 다음 월드컵 사이클로 롤(폼·랭킹 이월) + 커서 리셋.
    advanceToNextEdition()
    useSeasonStore.getState().reset()
  } else {
    // 월드컵 다음 일정으로 커서 이동(이미 더 진행했으면 유지).
    useSeasonStore.getState().setCursor(Math.max(useSeasonStore.getState().cursorIndex, wcIdx + 1))
  }
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
