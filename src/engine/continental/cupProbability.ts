import type { TeamRatings } from '../../types/team'
import type { KnockoutRound } from '../../types/match'
import type { CupFormat } from '../../data/continental/formats'
import { runCup, runCupLocked, type CupResult } from './runCup'

/**
 * 대륙컵 확률(월드컵과 동일 개념). 주어진 참가국 필드로 대회를 여러 번(무작위 조추첨+경기) 시뮬레이션해
 * 팀별 조별 통과 / 라운드별 도달 / 우승 확률을 낸다. runCup을 반복 시드로 돌려 분포를 만든다(결정론적).
 */

/** 진출 체인 키: 'qualify'(조별 통과=녹아웃 진출) + 포맷의 각 녹아웃 라운드 도달 + 'champion'(우승). */
export interface CupTeamProb {
  /** 조별 통과(녹아웃 진출) 확률(%) */
  qualify: number
  /** 라운드 도달 확률(%) — 포맷 knockout 라운드별(R16/QF/SF/FINAL 등). */
  reach: Partial<Record<KnockoutRound, number>>
  /** 우승 확률(%) */
  champion: number
}

export interface CupProbabilities {
  cupId: CupFormat['id']
  iterations: number
  byTeam: Record<string, CupTeamProb>
}

/**
 * @param field 참가국 ID(길이 = format.teams)
 * @param iterations 반복 수(많을수록 정밀, 느림)
 * @param seedBase 시드 접두사(재현성). 반복마다 -i 를 붙여 조추첨·경기를 다양화.
 */
export function computeCupProbabilities(
  format: CupFormat,
  field: string[],
  ratings: Record<string, TeamRatings>,
  hostIds: string[],
  iterations: number,
  seedBase: string,
): CupProbabilities {
  const qualifyCount: Record<string, number> = {}
  const championCount: Record<string, number> = {}
  const reachCount: Record<string, Partial<Record<KnockoutRound, number>>> = {}
  for (const id of field) {
    qualifyCount[id] = 0
    championCount[id] = 0
    reachCount[id] = {}
  }

  for (let i = 0; i < iterations; i++) {
    const res = runCup(format, field, ratings, hostIds, `${seedBase}-${i}`)
    for (const id of res.qualified) qualifyCount[id] = (qualifyCount[id] ?? 0) + 1
    championCount[res.champion] = (championCount[res.champion] ?? 0) + 1
    // 라운드 도달 = 그 라운드 경기에 편성됨.
    for (const m of res.knockout) {
      if (m.round === 'THIRD') continue // 3·4위전은 '도달'로 세지 않음
      for (const tid of [m.homeTeamId, m.awayTeamId]) {
        const r = reachCount[tid] ?? (reachCount[tid] = {})
        r[m.round] = (r[m.round] ?? 0) + 1
      }
    }
  }

  const pct = (n: number) => (n / iterations) * 100
  const byTeam: Record<string, CupTeamProb> = {}
  for (const id of field) {
    const reach: Partial<Record<KnockoutRound, number>> = {}
    for (const r of format.knockout) reach[r] = pct(reachCount[id]?.[r] ?? 0)
    byTeam[id] = { qualify: pct(qualifyCount[id] ?? 0), reach, champion: pct(championCount[id] ?? 0) }
  }
  return { cupId: format.id, iterations, byTeam }
}

/**
 * '조건부(라이브)' 확률 — 월드컵 확률 대시보드처럼, 현재까지 공개된 결과를 고정하고 남은 경기만
 * 반복 시뮬레이션한다. 조추첨(대진)·공개된 조별/녹아웃 경기를 그대로 두므로 실황을 반영하며, 대회가
 * 끝나면 100%/0%로 수렴한다. field = 확정된 참가국(result의 조 구성).
 */
export function computeCupProbabilitiesLive(
  format: CupFormat,
  result: CupResult,
  revealedGroupMd: number,
  revealedKoRounds: number,
  ratings: Record<string, TeamRatings>,
  hostIds: string[],
  iterations: number,
  seedBase: string,
): CupProbabilities {
  const field = result.groups.flatMap((g) => g.teams)
  const qualifyCount: Record<string, number> = {}
  const championCount: Record<string, number> = {}
  const reachCount: Record<string, Partial<Record<KnockoutRound, number>>> = {}
  for (const id of field) {
    qualifyCount[id] = 0
    championCount[id] = 0
    reachCount[id] = {}
  }

  for (let i = 0; i < iterations; i++) {
    const run = runCupLocked(format, result, revealedGroupMd, revealedKoRounds, ratings, hostIds, `${seedBase}-${i}`)
    for (const id of run.qualified) qualifyCount[id] = (qualifyCount[id] ?? 0) + 1
    championCount[run.champion] = (championCount[run.champion] ?? 0) + 1
    for (const { round, teams } of run.reachRounds) {
      for (const tid of teams) {
        const r = reachCount[tid] ?? (reachCount[tid] = {})
        r[round] = (r[round] ?? 0) + 1
      }
    }
  }

  const pct = (n: number) => (n / iterations) * 100
  const byTeam: Record<string, CupTeamProb> = {}
  for (const id of field) {
    const reach: Partial<Record<KnockoutRound, number>> = {}
    for (const r of format.knockout) reach[r] = pct(reachCount[id]?.[r] ?? 0)
    byTeam[id] = { qualify: pct(qualifyCount[id] ?? 0), reach, champion: pct(championCount[id] ?? 0) }
  }
  return { cupId: format.id, iterations, byTeam }
}
