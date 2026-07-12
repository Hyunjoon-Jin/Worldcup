import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { QUALIFIER_HOME_ADVANTAGE } from '../config'
import { simulateScoreRaw, type RandomFn } from '../matchCore'
import { computeStandings, rankGroupTeams } from '../tiebreakers'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult, QualMatch } from '../../types/qualification'

export interface QualConfig {
  confederation: string
  /** 조 수(1이면 단일리그) */
  numGroups: number
  /** 본선 직행 슬롯 */
  direct: number
  /** 대륙간 PO행 슬롯 */
  playoff: number
  /** 조 내 홈&어웨이(2경기)면 true, 단판이면 false */
  doubleRound?: boolean
}

/**
 * 서클(circle) 방식 라운드로빈 일정 — 각 경기에 라운드(matchday)를 부여한다 (B1).
 * 홀수 팀이면 부전승(bye)을 넣어 처리한다.
 */
function roundRobinRounds(teams: string[]): Array<{ home: string; away: string; matchday: number }> {
  const arr = [...teams]
  if (arr.length % 2 !== 0) arr.push('__BYE__')
  const n = arr.length
  const rounds = n - 1
  const half = n / 2
  const out: Array<{ home: string; away: string; matchday: number }> = []
  let rot = arr.slice(1)
  for (let r = 0; r < rounds; r++) {
    const day = [arr[0], ...rot]
    for (let i = 0; i < half; i++) {
      const a = day[i]
      const b = day[n - 1 - i]
      if (a === '__BYE__' || b === '__BYE__') continue
      // 라운드마다 홈/원정을 번갈아 배정
      const [home, away] = r % 2 === 0 ? [a, b] : [b, a]
      out.push({ home, away, matchday: r + 1 })
    }
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)]
  }
  return out
}

/** 실력(랭킹) 순으로 뱀 배정(serpentine)해 조를 균형 있게 나눈다. */
export function snakeSeed(sorted: string[], numGroups: number): string[][] {
  const groups: string[][] = Array.from({ length: numGroups }, () => [])
  let g = 0
  let dir = 1
  for (const t of sorted) {
    groups[g].push(t)
    if (dir === 1) {
      if (g === numGroups - 1) dir = -1
      else g++
    } else {
      if (g === 0) dir = 1
      else g--
    }
  }
  return groups
}

/**
 * 한 조를 라운드로빈(선택적 홈&어웨이)으로 치르고 매치데이·조 태그가 붙은 경기와 조 순위를 반환한다.
 * 다단계 대륙(A3 AFC·A4 CONCACAF)에서 스테이지별로 조를 이어붙일 수 있도록 matchdayOffset·groupIndex를 받는다.
 */
/**
 * 이미 치른 경기 결과 조회(조건부 확률용). (home, away, 최종 matchday, group)로 고정 스코어를
 * 돌려주면 그 경기는 재시뮬레이션하지 않고 그 결과를 그대로 쓴다. null이면 새로 시뮬레이션한다.
 */
export type LockedLookup = (
  home: string,
  away: string,
  matchday: number,
  group: number,
) => { homeGoals: number; awayGoals: number } | null

export function playSingleGroup(
  teams: string[],
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
  opts: { doubleRound?: boolean; groupIndex: number; matchdayOffset?: number; locked?: LockedLookup },
): { matches: QualMatch[]; ranking: string[]; lastMatchday: number } {
  const off = opts.matchdayOffset ?? 0
  const schedule = roundRobinRounds(teams)
  const singleRounds = Math.max(1, teams.length % 2 === 0 ? teams.length - 1 : teams.length)
  const gm: QualMatch[] = []
  let last = off
  for (const { home, away, matchday } of schedule) {
    const legs = opts.doubleRound
      ? [
          { home, away, matchday },
          { home: away, away: home, matchday: matchday + singleRounds },
        ]
      : [{ home, away, matchday }]
    for (const leg of legs) {
      const md = leg.matchday + off
      // 이미 치른 경기면 고정 결과 사용(조건부 확률), 아니면 새로 시뮬레이션.
      const lk = opts.locked?.(leg.home, leg.away, md, opts.groupIndex)
      const s = lk ?? simulateScoreRaw(ratings[leg.home], ratings[leg.away], QUALIFIER_HOME_ADVANTAGE, 0, rand)
      gm.push({
        homeTeamId: leg.home,
        awayTeamId: leg.away,
        homeGoals: s.homeGoals,
        awayGoals: s.awayGoals,
        matchday: md,
        group: opts.groupIndex,
      })
      last = Math.max(last, md)
    }
  }
  return { matches: gm, ranking: rankGroupTeams(teams, gm), lastMatchday: last }
}

/**
 * 범용 조별 예선 (지역예선 Q2). 조 분할 → 조별 라운드로빈 → 조별 순위 → 같은 순위 팀들을
 * 전체 기록으로 횡단 비교해 글로벌 순위를 만든 뒤, 상위 direct 직행 + 다음 playoff를 PO로 보낸다.
 * numGroups=1이면 단일리그(CONMEBOL·OFC)와 동일하게 동작한다.
 */
/**
 * 조별 순위(각 조 순위순 팀 배열)와 경기 기록으로 대륙 전체 순위를 만든다.
 * 같은 조내 순위(1위끼리, 2위끼리 …)를 전체 기록(승점·득실·다득점·랭킹)으로 횡단 비교한다.
 * 진행 중 잠정 순위 계산에도 재사용한다(전달하는 matches를 치른 경기로 한정).
 */
export function rankAcrossGroups(groupRankings: string[][], matches: QualMatch[], teams: string[]): string[] {
  const overall = computeStandings(teams, matches)
  const byRecord = (a: string, b: string) => {
    const sa = overall[a]
    const sb = overall[b]
    if (sb.points !== sa.points) return sb.points - sa.points
    const gda = sa.goalsFor - sa.goalsAgainst
    const gdb = sb.goalsFor - sb.goalsAgainst
    if (gdb !== gda) return gdb - gda
    if (sb.goalsFor !== sa.goalsFor) return sb.goalsFor - sa.goalsFor
    return ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox
  }
  const maxLen = groupRankings.length ? Math.max(...groupRankings.map((r) => r.length)) : 0
  const standings: string[] = []
  for (let pos = 0; pos < maxLen; pos++) {
    const atPos = groupRankings.map((r) => r[pos]).filter(Boolean) as string[]
    atPos.sort(byRecord)
    standings.push(...atPos)
  }
  return standings
}

export function simulateGroupQualification(
  teams: string[],
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
  cfg: QualConfig,
  locked?: LockedLookup,
): QualificationResult {
  const sorted = [...teams].sort(
    (a, b) => ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox,
  )
  const groups = snakeSeed(sorted, cfg.numGroups)
  const matches: QualMatch[] = []
  const groupRankings: string[][] = []
  let matchdays = 0

  groups.forEach((g, gi) => {
    const { matches: gm, ranking, lastMatchday } = playSingleGroup(g, ratings, rand, {
      doubleRound: cfg.doubleRound,
      groupIndex: gi,
      locked,
    })
    matches.push(...gm)
    matchdays = Math.max(matchdays, lastMatchday)
    groupRankings.push(ranking)
  })

  const standings = rankAcrossGroups(groupRankings, matches, teams)

  return {
    confederation: cfg.confederation,
    standings,
    groups: groupRankings,
    qualified: standings.slice(0, cfg.direct),
    playoff: standings.slice(cfg.direct, cfg.direct + cfg.playoff),
    matches,
    matchdays,
  }
}
