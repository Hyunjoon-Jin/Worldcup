import { usePerformanceStore } from './usePerformanceStore'
import { useCareerStore } from './useCareerStore'
import { useQualificationStore } from './useQualificationStore'
import { useProgressStore } from './useProgressStore'
import { useContinentalStore } from './useContinentalStore'
import { useContinentalHistoryStore } from './useContinentalHistoryStore'
import {
  overallDeltasFromPlay,
  formNudgeDeltasFromPlay,
  MATCH_IMPORTANCE,
  IMPORTANCE_QUALIFIER,
  IMPORTANCE_WC_GROUP,
  IMPORTANCE_WC_KO,
  type EloPlayMatch,
} from '../engine/qualification/ranking'
import { collectPlayedByConfed, flattenPlayed } from '../engine/qualification/conditional'
import { CUP_FORMATS } from '../data/continental/formats'

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
 * 성적→능력치 보정을 '치른 모든 경기'에서 종합해 계산하고 store에 반영한다(성적 반영 흐름의 단일 소유자).
 * 예선·친선·대륙컵·월드컵 본선에서 치른 각 경기를 대회별 FIFA 중요도로 Elo 누적하고(상대 강약 반영),
 * 여기에 결과(승/무/패) 기반 최근 폼 보정을 더해 '매 경기마다' 능력치가 조금씩 오르내리도록 한다
 * (월드컵이 아니어도, 강팀이 약팀을 이겨 Elo 변동이 0에 수렴해도 폼으로 소폭 움직인다). 여기에 커리어
 * 폼(이월)과 역대 대륙컵 입상 prestige를 더하고 ±8로 클램프한다. getRatings가 이 값을 공격·수비·종합에 더한다.
 */
export function recomputePerformanceDeltas(): void {
  const qr = useQualificationStore.getState().result
  const revealed = useQualificationStore.getState().revealed
  const friendlies = useQualificationStore.getState().friendlies
  const carriedForm = useCareerStore.getState().carriedForm

  const groups: Array<{ matches: EloPlayMatch[]; importance: number }> = []

  // 1) 월드컵/대륙 지역예선 + 2) 친선전 — 공개된 경기까지.
  if (qr) {
    groups.push({ matches: flattenPlayed(collectPlayedByConfed(qr, revealed)), importance: IMPORTANCE_QUALIFIER })
    const globalRevealed = Math.max(0, ...Object.values(revealed))
    groups.push({ matches: friendlies.filter((f) => f.matchday <= globalRevealed), importance: MATCH_IMPORTANCE.friendlyInWindow })
  }

  // 3) 대륙컵 본선(현재 활성 대회) — 공개 단계까지의 조별·녹아웃.
  const cs = useContinentalStore.getState()
  if (cs.activeCupId && cs.result) {
    const revealedGroupMd = Math.min(cs.stage, 3)
    const revealedKoRounds = Math.max(0, cs.stage - 3)
    const koOrder = CUP_FORMATS[cs.activeCupId].knockout
    const mainRounds = koOrder.filter((r) => r !== 'THIRD')
    const revealedRounds = new Set<string>(mainRounds.slice(0, revealedKoRounds))
    if (CUP_FORMATS[cs.activeCupId].thirdPlace && revealedKoRounds >= mainRounds.length) revealedRounds.add('THIRD')
    groups.push({ matches: cs.result.groups.flatMap((g) => g.matches.filter((m) => m.matchday <= revealedGroupMd)), importance: MATCH_IMPORTANCE.continentalGroup })
    groups.push({
      matches: cs.result.knockout
        .filter((m) => revealedRounds.has(m.round))
        .map((m) => ({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.result.homeGoals, awayGoals: m.result.awayGoals, wentToPenalties: m.result.wentToPenalties, winnerTeamId: m.result.winnerTeamId })),
      importance: MATCH_IMPORTANCE.continentalKnockout,
    })
  }

  // 4) 월드컵 본선 — 치른 조별·녹아웃.
  const prog = useProgressStore.getState()
  if (prog.phase !== 'idle') {
    groups.push({ matches: prog.groupMatches, importance: IMPORTANCE_WC_GROUP })
    groups.push({ matches: Object.values(prog.knockoutSlots).map((s) => s.result).filter((m): m is NonNullable<typeof m> => m != null), importance: IMPORTANCE_WC_KO })
  }

  const playD = overallDeltasFromPlay(groups) // Elo 기반(상대 강약 반영) 보정
  const formD = formNudgeDeltasFromPlay(groups) // 결과(승/무/패) 기반 최근 폼 — 매 경기 소폭 진동
  const contTrophy = continentalDeltas() // 역대 대륙컵 우승·입상 prestige(지난 대회 경기는 저장 안 되므로 별도 유지)

  const combined: Record<string, number> = {}
  const ids = new Set([...Object.keys(playD), ...Object.keys(formD), ...Object.keys(carriedForm), ...Object.keys(contTrophy)])
  for (const id of ids) {
    combined[id] = clamp8((playD[id] ?? 0) + (formD[id] ?? 0) + (carriedForm[id] ?? 0) + (contTrophy[id] ?? 0) * 0.5)
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
  // 대륙컵 본선 진행(단계 공개)마다 성적 반영을 갱신 — 대륙컵 경기도 매 경기 능력치에 반영되도록.
  useContinentalStore.subscribe((s, p) => {
    if (s.stage !== p.stage || s.result !== p.result || s.activeCupId !== p.activeCupId) scheduleRecompute()
  })
  useContinentalHistoryStore.subscribe((s, p) => {
    if (s.editions !== p.editions) scheduleRecompute()
  })
}
