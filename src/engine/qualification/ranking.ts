import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { ratingsFromRank } from '../../data/teams'
import { clamp } from '../config'
import type { AllQualificationResult } from './index'
import type { QualMatch } from '../../types/qualification'
import type { TeamRatings } from '../../types/team'

/**
 * 경기 결과로 FIFA 랭킹을 갱신하는 Elo 근사 엔진 (월 단위 랭킹 반영).
 * 예선 경기가 진행될수록 승패·이변이 랭킹 점수에 누적 반영되고, 갱신된 점수는
 * 남은 경기·본선의 전력 추정에 쓰인다(확률 계산이 실황을 반영하도록).
 */

const BASE = 2000
const PER_RANK = 12

/** FIFA 랭킹(숫자 작을수록 강함) → 초기 Elo 점수(높을수록 강함). */
export function basePointsFromRank(rank: number): number {
  return Math.max(300, BASE - (rank - 1) * PER_RANK)
}

/** Elo 점수 → 유효 랭킹(전력 곡선 입력용). 점수가 높을수록 낮은(=강한) 랭킹 숫자. */
export function effectiveRankFromPoints(points: number): number {
  return Math.max(1, (BASE - points) / PER_RANK + 1)
}

function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400))
}

/** 한 경기 결과로 두 팀의 Elo 점수를 제자리 갱신한다(골 차 가중, 무승부 0.5). */
export function applyMatchElo(
  points: Record<string, number>,
  m: { homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number },
  k = 24,
): void {
  const h = points[m.homeTeamId]
  const a = points[m.awayTeamId]
  if (h == null || a == null) return
  const outcomeH = m.homeGoals > m.awayGoals ? 1 : m.homeGoals < m.awayGoals ? 0 : 0.5
  const margin = Math.abs(m.homeGoals - m.awayGoals)
  const weight = 1 + Math.min(1, Math.max(0, margin - 1) * 0.25) // 1~2배(대승일수록 큰 변동)
  const delta = k * weight * (outcomeH - expectedScore(h, a))
  points[m.homeTeamId] = h + delta
  points[m.awayTeamId] = a - delta
}

/** 참가국들의 초기 Elo 점수 맵. */
export function initRankingPoints(teamIds: string[]): Record<string, number> {
  const p: Record<string, number> = {}
  for (const id of teamIds) p[id] = basePointsFromRank(ALL_NATIONS_BY_ID[id]?.fifaRankApprox ?? 100)
  return p
}

/** 초기 점수에서 경기들을 순서대로 적용한 새 점수 맵을 만든다(원본 불변). */
export function updateRankingPoints(basePoints: Record<string, number>, matches: QualMatch[]): Record<string, number> {
  const p = { ...basePoints }
  for (const m of matches) applyMatchElo(p, m)
  return p
}

/** Elo 점수 → 갱신 전력(overall은 점수 곡선, 공수 성향은 기존 팀 배분 유지). */
export function updatedRatingsFromPoints(points: Record<string, number>): Record<string, TeamRatings> {
  const out: Record<string, TeamRatings> = {}
  for (const id of Object.keys(points)) {
    const nation = ALL_NATIONS_BY_ID[id]
    if (!nation) continue
    const base = nation.baseRatings
    const fresh = ratingsFromRank(effectiveRankFromPoints(points[id]))
    const offset = base.attack - base.overall // 기존 공수 성향(styleShift) 보존
    out[id] = {
      overall: fresh.overall,
      attack: clamp(fresh.overall + offset, 1, 99),
      defense: clamp(fresh.overall - offset, 1, 99),
      form: base.form,
    }
  }
  return out
}

export interface RankMover {
  teamId: string
  baseRank: number
  currentRank: number
  /** 상승(+)/하락(-) 계단 수 */
  delta: number
  points: number
}

/**
 * 경기 진행 상황(played)을 반영한 참가국 내부 랭킹과 변동을 계산한다.
 * baseRank/currentRank는 "참가국 집합 내 순위"(1=최강)로, 델타는 상승이 양수.
 */
export function computeRankingMovers(all: AllQualificationResult, played: QualMatch[]): RankMover[] {
  const teamIds = new Set<string>()
  for (const c of Object.keys(all.byConfederation)) {
    for (const m of all.byConfederation[c].matches) {
      teamIds.add(m.homeTeamId)
      teamIds.add(m.awayTeamId)
    }
  }
  const ids = [...teamIds]
  const base = initRankingPoints(ids)
  const now = updateRankingPoints(base, played)

  const rankOf = (pts: Record<string, number>) => {
    const sorted = [...ids].sort((a, b) => pts[b] - pts[a] || ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox)
    const r: Record<string, number> = {}
    sorted.forEach((id, i) => (r[id] = i + 1))
    return r
  }
  const baseRanks = rankOf(base)
  const nowRanks = rankOf(now)

  return ids
    .map((id) => ({
      teamId: id,
      baseRank: baseRanks[id],
      currentRank: nowRanks[id],
      delta: baseRanks[id] - nowRanks[id], // 순위 숫자 감소 = 상승(+)
      points: now[id],
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.points - a.points)
}

/**
 * 예선 전체 결과(폼)를 본선 컨디션 폼 가감치로 환산한다 (우승 확률에 예선 실황 반영).
 * Elo 상승분을 폼 점수로 스케일링(약 20 Elo ≈ 1 폼), maxOffset로 클램프.
 */
export function formOffsetsFromResults(all: AllQualificationResult, maxOffset = 6): Record<string, number> {
  const ids = new Set<string>()
  for (const c of Object.keys(all.byConfederation)) {
    for (const m of all.byConfederation[c].matches) {
      ids.add(m.homeTeamId)
      ids.add(m.awayTeamId)
    }
  }
  const idList = [...ids]
  const base = initRankingPoints(idList)
  const allMatches = Object.values(all.byConfederation)
    .flatMap((r) => r.matches)
    .sort((a, b) => a.matchday - b.matchday)
  const now = updateRankingPoints(base, allMatches)
  const out: Record<string, number> = {}
  for (const id of idList) {
    out[id] = Math.max(-maxOffset, Math.min(maxOffset, Math.round((now[id] - base[id]) / 20)))
  }
  return out
}
