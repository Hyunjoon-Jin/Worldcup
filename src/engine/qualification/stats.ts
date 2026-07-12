import { nationsByConfederation } from '../../data/nations'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { HOST_SLOTS } from '../../data/hostSlots'
import type { AllQualificationResult } from './index'
import type { QualMatch } from '../../types/qualification'
import type { Confederation } from '../../types/team'

const HOST_IDS = Object.keys(HOST_SLOTS)
const CONFEDS: Confederation[] = ['UEFA', 'CAF', 'AFC', 'CONMEBOL', 'CONCACAF', 'OFC']

/** 대륙 예선 난이도(G4): 진출 자리 하나당 몇 팀이 경쟁하는가. */
export interface ConfedDifficulty {
  confederation: Confederation
  /** 예선에 참가하는 팀 수(개최국은 CONCACAF에서 제외) */
  participants: number
  /** 경쟁으로 얻는 자리 수(직행 + 대륙간 PO행, CONCACAF는 개최 3국 제외) */
  spots: number
  /** 자리당 경쟁 팀 수(높을수록 치열) */
  ratio: number
}

/** 대륙별 예선 난이도 지수를 계산한다(정적 등록·슬롯 기반, G4). ratio 내림차순. */
export function computeConfedDifficulty(): ConfedDifficulty[] {
  return CONFEDS.map((c) => {
    const isConcacaf = c === 'CONCACAF'
    const participants = nationsByConfederation(c).filter((t) => !(isConcacaf && HOST_IDS.includes(t.id))).length
    const slots = SLOT_ALLOCATION[c]
    const spots = (isConcacaf ? slots.direct - HOST_IDS.length : slots.direct) + slots.playoff
    return { confederation: c, participants, spots, ratio: spots > 0 ? participants / spots : participants }
  }).sort((a, b) => b.ratio - a.ratio)
}

/** 한 팀의 예선 누적 성적. */
export interface QualTeamStat {
  teamId: string
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
}

/** 예선 전체 통계(F5). 랭킹 리더보드 + 최다 점수차 경기. */
export interface QualStats {
  topScorers: QualTeamStat[]
  bestDefense: QualTeamStat[]
  mostWins: QualTeamStat[]
  biggestWin: { match: QualMatch; margin: number } | null
}

/**
 * 표본 기반 진출 확률의 95% 신뢰구간 오차범위(±%)를 계산한다 (G2).
 * 비율 p에 대한 표준오차 = sqrt(p(1-p)/n), 95% 신뢰수준은 ×1.96.
 */
export function probMarginPct(pct: number, n: number): number {
  if (n <= 0) return 0
  const p = Math.min(1, Math.max(0, pct / 100))
  return 1.96 * Math.sqrt((p * (1 - p)) / n) * 100
}

/** 행운/불운 분석 항목(G5). */
export interface LuckEntry {
  teamId: string
  probability: number
}

/** 진출 확률 대비 실제 결과(G5): 낮은 확률로 진출(행운) vs 높은 확률로 탈락(불운). */
export interface LuckAnalysis {
  lucky: LuckEntry[]
  unlucky: LuckEntry[]
}

/**
 * 진출 확률과 실제 결과를 대조해 "행운의 진출 / 아쉬운 탈락"을 뽑는다 (G5).
 * lucky = 진출했지만 확률이 luckyMax 미만(낮은 확률로 뚫음, 확률 오름차순).
 * unlucky = 탈락했지만 확률이 unluckyMin 초과(높은 확률인데 미끄러짐, 확률 내림차순).
 * 개최국은 항상 100%라 제외한다.
 */
export function computeLuckAnalysis(
  all: AllQualificationResult,
  probabilities: Record<string, number>,
  topN = 4,
  luckyMax = 70,
  unluckyMin = 30,
): LuckAnalysis {
  const qualified = new Set(all.qualified48)
  const hosts = new Set(all.hosts)
  const entries = Object.keys(probabilities)
    .filter((id) => !hosts.has(id))
    .map((id) => ({ teamId: id, probability: probabilities[id], qualified: qualified.has(id) }))

  const lucky = entries
    .filter((e) => e.qualified && e.probability < luckyMax)
    .sort((a, b) => a.probability - b.probability)
    .slice(0, topN)
    .map(({ teamId, probability }) => ({ teamId, probability }))

  const unlucky = entries
    .filter((e) => !e.qualified && e.probability > unluckyMin)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, topN)
    .map(({ teamId, probability }) => ({ teamId, probability }))

  return { lucky, unlucky }
}

function tallyMatch(map: Map<string, QualTeamStat>, teamId: string): QualTeamStat {
  let s = map.get(teamId)
  if (!s) {
    s = { teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }
    map.set(teamId, s)
  }
  return s
}

/**
 * 모든 대륙 예선 경기를 누적해 팀별 성적과 리더보드를 만든다 (F5).
 * 각 팀은 자기 대륙 안에서만 경기하므로 대륙 구분 없이 팀 ID로 합산하면 된다.
 */
export function computeQualStats(all: AllQualificationResult, topN = 5): QualStats {
  const map = new Map<string, QualTeamStat>()
  let biggest: { match: QualMatch; margin: number } | null = null

  for (const confed of Object.keys(all.byConfederation)) {
    for (const m of all.byConfederation[confed].matches) {
      const home = tallyMatch(map, m.homeTeamId)
      const away = tallyMatch(map, m.awayTeamId)
      home.played++
      away.played++
      home.goalsFor += m.homeGoals
      home.goalsAgainst += m.awayGoals
      away.goalsFor += m.awayGoals
      away.goalsAgainst += m.homeGoals
      if (m.homeGoals > m.awayGoals) {
        home.wins++
        away.losses++
      } else if (m.homeGoals < m.awayGoals) {
        away.wins++
        home.losses++
      } else {
        home.draws++
        away.draws++
      }
      const margin = Math.abs(m.homeGoals - m.awayGoals)
      if (!biggest || margin > biggest.margin) biggest = { match: m, margin }
    }
  }

  const stats = [...map.values()]
  const topScorers = [...stats].sort((a, b) => b.goalsFor - a.goalsFor || a.goalsAgainst - b.goalsAgainst).slice(0, topN)
  // 최소 실점: 경기 수가 지나치게 적은 팀(엣지)은 제외하려 최소 3경기 이상만
  const bestDefense = [...stats]
    .filter((s) => s.played >= 3)
    .sort((a, b) => a.goalsAgainst - b.goalsAgainst || b.goalsFor - a.goalsFor)
    .slice(0, topN)
  const mostWins = [...stats].sort((a, b) => b.wins - a.wins || b.goalsFor - a.goalsFor).slice(0, topN)

  return { topScorers, bestDefense, mostWins, biggestWin: biggest }
}
