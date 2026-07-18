import { usePerformanceStore } from './usePerformanceStore'
import { useCareerStore } from './useCareerStore'
import { useQualificationStore } from './useQualificationStore'
import { useProgressStore } from './useProgressStore'
import { useContinentalHistoryStore } from './useContinentalHistoryStore'
import { overallDeltasFromResults } from '../engine/qualification/ranking'
import { collectPlayedByConfed, flattenPlayed } from '../engine/qualification/conditional'
import { finalsFormDeltas } from '../engine/finalsForm'

const clamp8 = (n: number) => Math.max(-8, Math.min(8, n))

/**
 * 대륙컵 성적을 소폭 능력치 보정으로 환산한다(역대 기록 기준). 우승 +3 · 준우승 +2 · 3위 +1.
 * 최근 대회들을 누적해 "대륙컵에서 잘 나가는 팀은 전력이 조금 오른다"를 반영한다.
 */
function continentalDeltas(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of useContinentalHistoryStore.getState().editions.slice(0, 14)) {
    if (e.champion) out[e.champion] = (out[e.champion] ?? 0) + 3
    if (e.runnerUp) out[e.runnerUp] = (out[e.runnerUp] ?? 0) + 2
    if (e.third) out[e.third] = (out[e.third] ?? 0) + 1
  }
  return out
}

/**
 * 성적→능력치 보정을 '모든 대회'에서 종합해 계산하고 store에 반영한다(성적 반영 흐름의 단일 소유자).
 * - 지역예선: 진행된 경기의 FIFA 점수 변동 → ±5.
 * - 월드컵 본선: 진출 라운드(우승/준우승/4강 …) → 라이브 반영(×0.5 가중).
 * - 대륙컵: 역대 우승·입상 → 라이브 반영(×0.5 가중).
 * - 커리어 폼: 직전 대회들에서 이월된 누적 보정.
 * 합계는 ±8로 클램프한다. getRatings가 이 값을 공격·수비·종합에 더한다.
 */
export function recomputePerformanceDeltas(): void {
  const qr = useQualificationStore.getState().result
  const revealed = useQualificationStore.getState().revealed
  const carriedForm = useCareerStore.getState().carriedForm
  const qualD = qr ? overallDeltasFromResults(qr, flattenPlayed(collectPlayedByConfed(qr, revealed))) : {}
  const prog = useProgressStore.getState()
  const finalsD = prog.phase !== 'idle' ? finalsFormDeltas(prog.knockoutSlots, prog.champion) : {}
  const contD = continentalDeltas()

  const combined: Record<string, number> = {}
  const ids = new Set([...Object.keys(qualD), ...Object.keys(carriedForm), ...Object.keys(finalsD), ...Object.keys(contD)])
  for (const id of ids) {
    combined[id] = clamp8((qualD[id] ?? 0) + (carriedForm[id] ?? 0) + (finalsD[id] ?? 0) * 0.5 + (contD[id] ?? 0) * 0.5)
  }
  usePerformanceStore.getState().setDeltas(combined)
}

// ── 본선·대륙컵 진행도 성적 반영에 반영되도록, 해당 store 변화 시 재계산을 예약한다(마이크로태스크로 코얼레싱).
// 이렇게 하면 useProgressStore/useContinentalHistoryStore가 performanceActions를 import하지 않아 순환을 피한다.
let scheduled = false
function scheduleRecompute(): void {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    // 예선 결과가 없어도(본선·대륙컵만 진행한 경우) 성적 반영이 되도록 항상 재계산한다.
    // recomputePerformanceDeltas는 예선이 없으면 예선 기여를 0으로 처리하므로 안전하다.
    recomputePerformanceDeltas()
  })
}

let initialized = false
/** 본선·대륙컵 진행을 성적 반영에 연결한다(앱 시작 시 1회). 모듈 로드 순환을 피하려 구독은 여기서 건다. */
export function initPerformanceTracking(): void {
  if (initialized) return
  initialized = true
  useProgressStore.subscribe((s, p) => {
    if (s.groupMatches !== p.groupMatches || s.knockoutSlots !== p.knockoutSlots || s.phase !== p.phase) scheduleRecompute()
  })
  useContinentalHistoryStore.subscribe((s, p) => {
    if (s.editions !== p.editions) scheduleRecompute()
  })
}
