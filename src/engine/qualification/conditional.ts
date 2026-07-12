import type { LockedLookup } from './generic'
import type { AllQualificationResult } from './index'
import type { QualMatch } from '../../types/qualification'

/** 워커로 넘길 수 있는 직렬화 가능한 "이미 치른 경기" 데이터. */
export interface LockedMatchData {
  group: number
  matchday: number
  homeTeamId: string
  awayTeamId: string
  homeGoals: number
  awayGoals: number
}

/** 현재 결과 + 대륙별 공개 라운드로부터 이미 치른 경기를 대륙별로 뽑는다(미지정=전체 공개). */
export function collectPlayedByConfed(
  all: AllQualificationResult,
  revealed: Record<string, number>,
): Record<string, LockedMatchData[]> {
  const out: Record<string, LockedMatchData[]> = {}
  for (const c of Object.keys(all.byConfederation)) {
    const rev = revealed[c] ?? all.byConfederation[c].matchdays
    out[c] = all.byConfederation[c].matches
      .filter((m) => m.matchday <= rev)
      .map((m) => ({
        group: m.group,
        matchday: m.matchday,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
      }))
  }
  return out
}

/** 직렬화 데이터 → 대륙별 LockedLookup(엔진 주입용). */
export function buildLockedLookups(data: Record<string, LockedMatchData[]>): Record<string, LockedLookup> {
  const out: Record<string, LockedLookup> = {}
  for (const c of Object.keys(data)) {
    const map = new Map<string, { homeGoals: number; awayGoals: number }>()
    for (const m of data[c]) {
      map.set(`${m.group}|${m.matchday}|${m.homeTeamId}|${m.awayTeamId}`, { homeGoals: m.homeGoals, awayGoals: m.awayGoals })
    }
    out[c] = (home, away, md, group) => map.get(`${group}|${md}|${home}|${away}`) ?? null
  }
  return out
}

/** 하나라도 미완 라운드가 있으면(부분 진행) true — 이때만 조건부 확률이 의미 있다. */
export function isPartialProgress(all: AllQualificationResult, revealed: Record<string, number>): boolean {
  return Object.keys(all.byConfederation).some(
    (c) => (revealed[c] ?? all.byConfederation[c].matchdays) < all.byConfederation[c].matchdays,
  )
}

/** 이미 치른 모든 경기를 매치데이 순으로 평탄화한다(Elo 랭킹 갱신용). */
export function flattenPlayed(data: Record<string, LockedMatchData[]>): QualMatch[] {
  const out: QualMatch[] = []
  for (const c of Object.keys(data)) {
    for (const m of data[c]) out.push({ ...m })
  }
  return out.sort((a, b) => a.matchday - b.matchday)
}
