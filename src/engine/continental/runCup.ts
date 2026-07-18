import type { TeamRatings } from '../../types/team'
import type { GroupStanding } from '../../types/group'
import type { KnockoutRound } from '../../types/match'
import type { CupFormat } from '../../data/continental/formats'
import { simulateScoreRaw, simulateKnockoutRaw, type SimKnockout } from '../matchCore'
import { hostAdvantageFor } from '../config'
import { computeStandings, rankGroupTeams } from '../tiebreakers'
import { createSeededRandom, type RandomFn } from '../rng'

/**
 * 대륙별 대표 대회(컨티넨탈 챔피언십) 제네릭 엔진. CupFormat 하나로 조추첨→조별리그→녹아웃→우승을
 * 결정론적으로 시뮬레이션한다. 월드컵 파이프라인과 완전히 분리된 순수 함수 — 전역(hostContext 등)을
 * 읽지 않고 hostIds를 명시 인자로 받는다(감사 A1 대응). 홈 이점은 개최국에만 적용.
 */

export interface CupMatch {
  homeTeamId: string
  awayTeamId: string
  homeGoals: number
  awayGoals: number
  group: number
  matchday: number
}

export interface CupGroupResult {
  groupIndex: number
  teams: string[] // 조추첨 순서
  matches: CupMatch[]
  ranking: string[] // 최종 순위
  standings: Record<string, GroupStanding>
}

export interface CupKnockoutMatch {
  round: KnockoutRound
  slotId: string
  homeTeamId: string
  awayTeamId: string
  result: SimKnockout
}

export interface CupResult {
  cupId: CupFormat['id']
  groups: CupGroupResult[]
  /** 조별 통과(녹아웃 진출) 팀 */
  qualified: string[]
  knockout: CupKnockoutMatch[]
  champion: string
  runnerUp: string
  third: string | null
  hosts: string[]
}

/** CupResult를 FIFA 랭킹 반영용 형태로 변환한다(조별·녹아웃 경기 목록). */
export function cupToRankingResults(result: CupResult): {
  groupMatches: Array<{ homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number }>
  knockoutMatches: Array<{ homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number; wentToPenalties?: boolean; winnerTeamId?: string }>
} {
  const groupMatches = result.groups.flatMap((g) =>
    g.matches.map((m) => ({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals })),
  )
  const knockoutMatches = result.knockout.map((m) => ({
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeGoals: m.result.homeGoals,
    awayGoals: m.result.awayGoals,
    wentToPenalties: m.result.wentToPenalties,
    winnerTeamId: m.result.winnerTeamId,
  }))
  return { groupMatches, knockoutMatches }
}

const ratingOf = (id: string, ratings: Record<string, TeamRatings>) => ratings[id]?.overall ?? 0
const hostAdv = (id: string, hostSet: Set<string>) => (hostSet.has(id) ? hostAdvantageFor(id) : 0)

/** Fisher–Yates 시드 셔플(결정론적). */
function seededShuffle<T>(arr: T[], rand: RandomFn): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 라운드로빈 단판 대진(서클 메서드). matchday 1..(n-1). */
function roundRobin(teams: string[]): Array<{ home: string; away: string; matchday: number }> {
  const ids = [...teams]
  if (ids.length % 2 === 1) ids.push('__BYE__')
  const n = ids.length
  const rounds = n - 1
  const half = n / 2
  const out: Array<{ home: string; away: string; matchday: number }> = []
  const arr = [...ids]
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const home = arr[i]
      const away = arr[n - 1 - i]
      if (home !== '__BYE__' && away !== '__BYE__') {
        // 홈/원정 균형(라운드 짝수에서 스왑)
        out.push(r % 2 === 0 ? { home, away, matchday: r + 1 } : { home: away, away: home, matchday: r + 1 })
      }
    }
    // 회전(첫 팀 고정)
    arr.splice(1, 0, arr.pop() as string)
  }
  return out
}

/**
 * 조추첨: 능력치 포트(teamsPerGroup개) → 각 포트를 시드 셔플해 조에 한 명씩 배정.
 * 개최국(hostIds)은 실제 대륙 대회처럼 포트1로 보호해 A조부터 순서대로 시드 배정한다(능력치와 무관).
 * 월드컵 본선 조추첨(drawEngine)의 개최국 보호와 동일한 원칙 — 개최국이 약체라도 포트4에 빠지지 않는다.
 */
export function drawCupGroups(
  format: CupFormat,
  teamIds: string[],
  ratings: Record<string, TeamRatings>,
  rand: RandomFn,
  hostIds: string[] = [],
): string[][] {
  const groups: string[][] = Array.from({ length: format.groups }, () => [])
  // 개최국을 포트1 시드로 보호: 참가 필드에 있는 개최국을 A조부터 한 조에 하나씩 배정(최대 조 수까지).
  const protectedHosts = [...new Set(hostIds)].filter((id) => teamIds.includes(id)).slice(0, format.groups)
  const protectedSet = new Set(protectedHosts)
  protectedHosts.forEach((h, i) => groups[i].push(h))
  // 나머지는 능력치 순으로 포트를 나눠 배정한다.
  const nonHost = teamIds.filter((id) => !protectedSet.has(id)).sort((a, b) => ratingOf(b, ratings) - ratingOf(a, ratings) || a.localeCompare(b))
  // 포트1 잔여: 개최국이 없는 조를 상위 비개최국으로 시드 셔플해 채운다.
  const emptyPot1 = groups.map((_, i) => i).filter((i) => groups[i].length === 0)
  const pot1Fill = seededShuffle(nonHost.slice(0, emptyPot1.length), rand)
  emptyPot1.forEach((gi, k) => groups[gi].push(pot1Fill[k]))
  let cursor = emptyPot1.length
  // 포트2..: 각 포트를 시드 셔플해 조에 한 명씩.
  for (let p = 1; p < format.teamsPerGroup; p++) {
    const pot = seededShuffle(nonHost.slice(cursor, cursor + format.groups), rand)
    cursor += format.groups
    pot.forEach((t, i) => groups[i].push(t))
  }
  return groups
}

function simulateGroup(groupIndex: number, teams: string[], ratings: Record<string, TeamRatings>, hostSet: Set<string>, mode: CupFormat['groupTiebreak'], rand: RandomFn): CupGroupResult {
  const matches: CupMatch[] = []
  for (const { home, away, matchday } of roundRobin(teams)) {
    const s = simulateScoreRaw(ratings[home], ratings[away], hostAdv(home, hostSet), hostAdv(away, hostSet), rand)
    matches.push({ homeTeamId: home, awayTeamId: away, homeGoals: s.homeGoals, awayGoals: s.awayGoals, group: groupIndex, matchday })
  }
  const standings = computeStandings(teams, matches)
  const ranking = rankGroupTeams(teams, matches, mode)
  return { groupIndex, teams, matches, ranking, standings }
}

/** 조별 순위 지표로 여러 조의 3위 팀을 횡단 정렬(승점→득실→다득점→FIFA 랭킹 대체는 상위에서 이미 결정론적). */
function rankThirds(thirds: Array<{ teamId: string; s: GroupStanding }>): string[] {
  return [...thirds]
    .sort((a, b) => {
      const gdA = a.s.goalsFor - a.s.goalsAgainst
      const gdB = b.s.goalsFor - b.s.goalsAgainst
      return b.s.points - a.s.points || gdB - gdA || b.s.goalsFor - a.s.goalsFor || a.teamId.localeCompare(b.teamId)
    })
    .map((t) => t.teamId)
}

/**
 * 첫 녹아웃 라운드 대진(진출팀 → 매치 목록). 포맷에 따라:
 * - 최고3위 없음(16·8팀): 조 1위 vs 다른 조 2위 크로스 페어링.
 * - 최고3위 있음(24팀): 6조 R16 표준 레이아웃(유로형)에 최고 3위 4팀을 자기 조 회피 배정.
 */
function firstRoundPairings(format: CupFormat, groups: CupGroupResult[]): Array<{ home: string; away: string }> {
  const W = groups.map((g) => g.ranking[0])
  const R = groups.map((g) => g.ranking[1])
  if (format.bestThirds === 0) {
    const pairs: Array<{ home: string; away: string }> = []
    // 조를 (0,1),(2,3)… 짝으로 묶어 크로스: 1G_2k v 2G_{2k+1}, 1G_{2k+1} v 2G_2k
    for (let k = 0; k + 1 < format.groups; k += 2) {
      pairs.push({ home: W[k], away: R[k + 1] })
      pairs.push({ home: W[k + 1], away: R[k] })
    }
    return pairs
  }
  // 24팀·6조 R16 표준 레이아웃(유로형). 최고 3위 4팀을 승자-3위 슬롯(B·F·E·C 승자)에 자기 조 회피 배정.
  const thirdsRanked = rankThirds(groups.map((g) => ({ teamId: g.ranking[2], s: g.standings[g.ranking[2]] })))
  const bestThirds = thirdsRanked.slice(0, format.bestThirds)
  const thirdGroupOf = new Map(groups.map((g) => [g.ranking[2], g.groupIndex]))
  // 승자-3위 슬롯이 속한 조 인덱스(자기 조 3위와 안 만나게 회피 대상). 순서: B(1),F(5),E(4),C(2).
  const thirdSlotWinnerGroups = [1, 5, 4, 2]
  const assign = assignThirdsAvoidingOwn(bestThirds, thirdSlotWinnerGroups, thirdGroupOf)
  // R16 레이아웃(홈=상위 시드): [1B v T, 1A v 2C, 1F v T, 2D v 2E, 1E v T, 1D v 2F, 1C v T, 2A v 2B]
  return [
    { home: W[1], away: assign[0] },
    { home: W[0], away: R[2] },
    { home: W[5], away: assign[1] },
    { home: R[3], away: R[4] },
    { home: W[4], away: assign[2] },
    { home: W[3], away: R[5] },
    { home: W[2], away: assign[3] },
    { home: R[0], away: R[1] },
  ]
}

/** 최고 3위 팀을 슬롯(각 슬롯의 승자 조)에 배정하되 자기 조 3위가 그 조 승자와 안 만나게 그리디 회피. */
function assignThirdsAvoidingOwn(thirds: string[], slotWinnerGroups: number[], thirdGroupOf: Map<string, number>): string[] {
  const n = slotWinnerGroups.length
  const used = new Array(n).fill(false)
  const result: string[] = new Array(n).fill('')
  for (const t of thirds) {
    const tg = thirdGroupOf.get(t)
    let placed = false
    for (let i = 0; i < n; i++) {
      if (!used[i] && slotWinnerGroups[i] !== tg) {
        used[i] = true
        result[i] = t
        placed = true
        break
      }
    }
    if (!placed) {
      const i = used.indexOf(false)
      used[i] = true
      result[i] = t
    }
  }
  return result
}

function simulateKnockout(format: CupFormat, groups: CupGroupResult[], ratings: Record<string, TeamRatings>, hostSet: Set<string>, rand: RandomFn): { matches: CupKnockoutMatch[]; champion: string; runnerUp: string; third: string | null } {
  const ko: CupKnockoutMatch[] = []
  const play = (round: KnockoutRound, slotId: string, home: string, away: string): string => {
    const result = simulateKnockoutRaw(home, ratings[home], away, ratings[away], hostAdv(home, hostSet), hostAdv(away, hostSet), rand)
    ko.push({ round, slotId, homeTeamId: home, awayTeamId: away, result })
    return result.winnerTeamId
  }

  // 준결승 패자 추적(3·4위전용).
  let sfLosers: string[] = []

  // 첫 라운드
  const pairs = firstRoundPairings(format, groups)
  const firstRound = format.knockout[0]
  let winners: string[] = []
  const firstLosers: string[] = []
  pairs.forEach((p, i) => {
    const w = play(firstRound, `${firstRound}${i + 1}`, p.home, p.away)
    winners.push(w)
    firstLosers.push(w === p.home ? p.away : p.home)
  })
  if (firstRound === 'SF') sfLosers = firstLosers // 8팀 대회: SF가 첫 라운드

  // 이후 라운드: 인접 2개씩 페어링해 결승까지.
  for (let ri = 1; ri < format.knockout.length; ri++) {
    const round = format.knockout[ri]
    const next: string[] = []
    const losersThisRound: string[] = []
    for (let i = 0; i < winners.length; i += 2) {
      const home = winners[i]
      const away = winners[i + 1]
      const w = play(round, `${round}${i / 2 + 1}`, home, away)
      next.push(w)
      losersThisRound.push(w === home ? away : home)
    }
    if (round === 'SF') sfLosers = losersThisRound
    winners = next
  }

  const champion = winners[0]
  // 결승 패자 = 마지막 라운드(FINAL)의 패자
  const finalMatch = ko[ko.length - 1]
  const runnerUp = finalMatch.result.winnerTeamId === finalMatch.homeTeamId ? finalMatch.awayTeamId : finalMatch.homeTeamId

  let third: string | null = null
  if (format.thirdPlace && sfLosers.length === 2) {
    const w = play('THIRD', 'THIRD', sfLosers[0], sfLosers[1])
    third = w
  }
  return { matches: ko, champion, runnerUp, third }
}

export interface CupLockedRun {
  qualified: string[]
  champion: string
  /** 각 (3·4위전 제외) 녹아웃 매치에 편성된 팀들(라운드 도달 집계용). */
  reachRounds: Array<{ round: KnockoutRound; teams: string[] }>
}

/**
 * '조건부(라이브)' 단일 시뮬레이션 — 이미 공개된 결과(조추첨·조별 revealedGroupMd차전까지·녹아웃
 * revealedKoRounds라운드까지)를 **고정**하고 남은 경기만 새로 시뮬레이션한다. 월드컵 buildSnapshot과
 * 동일 개념으로, 이걸 반복하면 현재 실황을 반영한 진출·우승 확률이 나온다(완주 시 100%/0%로 수렴).
 */
export function runCupLocked(
  format: CupFormat,
  result: CupResult,
  revealedGroupMd: number,
  revealedKoRounds: number,
  ratings: Record<string, TeamRatings>,
  hostIds: string[],
  seed: string,
): CupLockedRun {
  const hostSet = new Set(hostIds)
  // 1) 조별리그: 조추첨(팀 구성)은 고정. 공개된 경기일은 실제 결과, 나머지는 새로 시뮬레이션.
  const groups: CupGroupResult[] = result.groups.map((g) => {
    const rand = createSeededRandom(`${seed}-G${g.groupIndex}`)
    const actualByKey = new Map(g.matches.map((m) => [`${m.homeTeamId}|${m.awayTeamId}|${m.matchday}`, m]))
    const matches: CupMatch[] = roundRobin(g.teams).map(({ home, away, matchday }) => {
      const actual = matchday <= revealedGroupMd ? actualByKey.get(`${home}|${away}|${matchday}`) : undefined
      const s = actual ?? simulateScoreRaw(ratings[home], ratings[away], hostAdv(home, hostSet), hostAdv(away, hostSet), rand)
      return { homeTeamId: home, awayTeamId: away, homeGoals: s.homeGoals, awayGoals: s.awayGoals, group: g.groupIndex, matchday }
    })
    const standings = computeStandings(g.teams, matches)
    const ranking = rankGroupTeams(g.teams, matches, format.groupTiebreak)
    return { groupIndex: g.groupIndex, teams: g.teams, matches, ranking, standings }
  })

  const qualified: string[] = []
  for (const g of groups) for (let i = 0; i < format.advancePerGroup; i++) qualified.push(g.ranking[i])
  if (format.bestThirds > 0) {
    const thirds = rankThirds(groups.map((g) => ({ teamId: g.ranking[2], s: g.standings[g.ranking[2]] })))
    qualified.push(...thirds.slice(0, format.bestThirds))
  }

  // 2) 녹아웃: 그룹이 모두 공개돼 대진이 고정된 경우, 공개된 라운드는 실제 승자, 나머지는 새로 시뮬레이션.
  const koRand = createSeededRandom(`${seed}-KO`)
  const actualBySlot = new Map(result.knockout.map((m) => [m.slotId, m]))
  const revealedRoundSet = new Set(format.knockout.slice(0, revealedKoRounds))
  const reachRounds: Array<{ round: KnockoutRound; teams: string[] }> = []
  const play = (round: KnockoutRound, slotId: string, home: string, away: string): string => {
    reachRounds.push({ round, teams: [home, away] })
    if (revealedRoundSet.has(round)) {
      const a = actualBySlot.get(slotId)
      if (a && (a.homeTeamId === home || a.homeTeamId === away)) return a.result.winnerTeamId
    }
    return simulateKnockoutRaw(home, ratings[home], away, ratings[away], hostAdv(home, hostSet), hostAdv(away, hostSet), koRand).winnerTeamId
  }
  const pairs = firstRoundPairings(format, groups)
  const firstRound = format.knockout[0]
  let winners = pairs.map((p, i) => play(firstRound, `${firstRound}${i + 1}`, p.home, p.away))
  for (let ri = 1; ri < format.knockout.length; ri++) {
    const round = format.knockout[ri]
    const next: string[] = []
    for (let i = 0; i < winners.length; i += 2) next.push(play(round, `${round}${i / 2 + 1}`, winners[i], winners[i + 1]))
    winners = next
  }
  return { qualified, champion: winners[0], reachRounds }
}

/** 대회 전체를 결정론적으로 시뮬레이션한다. teamIds 길이는 format.teams와 같아야 한다. */
export function runCup(
  format: CupFormat,
  teamIds: string[],
  ratings: Record<string, TeamRatings>,
  hostIds: string[],
  seed: string,
): CupResult {
  if (teamIds.length !== format.teams) {
    throw new Error(`runCup: ${format.id}는 ${format.teams}팀이 필요한데 ${teamIds.length}팀이 주어졌습니다`)
  }
  const hostSet = new Set(hostIds)
  const drawRand = createSeededRandom(`${seed}-${format.id}-DRAW`)
  const groupsTeams = drawCupGroups(format, teamIds, ratings, drawRand, hostIds)

  const groups: CupGroupResult[] = groupsTeams.map((teams, gi) =>
    simulateGroup(gi, teams, ratings, hostSet, format.groupTiebreak, createSeededRandom(`${seed}-${format.id}-G${gi}`)),
  )

  const qualified: string[] = []
  for (const g of groups) for (let i = 0; i < format.advancePerGroup; i++) qualified.push(g.ranking[i])
  if (format.bestThirds > 0) {
    const thirds = rankThirds(groups.map((g) => ({ teamId: g.ranking[2], s: g.standings[g.ranking[2]] })))
    qualified.push(...thirds.slice(0, format.bestThirds))
  }

  const koRand = createSeededRandom(`${seed}-${format.id}-KO`)
  const { matches, champion, runnerUp, third } = simulateKnockout(format, groups, ratings, hostSet, koRand)

  return { cupId: format.id, groups, qualified, knockout: matches, champion, runnerUp, third, hosts: hostIds }
}
