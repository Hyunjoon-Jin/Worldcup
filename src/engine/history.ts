import type { GroupMatch, KnockoutMatch, KnockoutRound, MatchResult } from '../types/match'

/** 한 대회에서 한 국가의 성적 기록. */
export interface TeamEditionRecord {
  /** 본선 진출 여부 */
  qualified: boolean
  /** 최종 도달 라운드 라벨(우승/준우승/3위/4위/8강/16강/조별리그/예선 탈락 등) */
  roundReached: string
  /** 본선 경기 수·승·무·패·득점·실점 */
  gp: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  /** 대회 종료 시점 FIFA 순위(전 세계 등수) — 미집계 시 null */
  rank: number | null
  /** 대회 종료 시점 FIFA 점수(반올림) */
  points: number | null
}

/** 한 대회(에디션) 전체 기록. */
export interface EditionRecord {
  year: number
  hostIds: string[]
  champion: string | null
  /** 국가별 성적 */
  byTeam: Record<string, TeamEditionRecord>
}

const ROUND_DEPTH: Record<KnockoutRound, number> = { R32: 1, R16: 2, QF: 3, SF: 4, THIRD: 4, FINAL: 5 }
const ROUND_LABEL: Record<KnockoutRound, string> = {
  R32: '32강',
  R16: '16강',
  QF: '8강',
  SF: '4강',
  THIRD: '3·4위전',
  FINAL: '결승',
}

/** 한 경기의 득실을 팀 관점으로 반환한다(홈/원정 자동 판별). 팀이 안 뛴 경기면 null. */
function goalsFor(teamId: string, m: MatchResult): { gf: number; ga: number } | null {
  if (m.homeTeamId === teamId) return { gf: m.homeGoals, ga: m.awayGoals }
  if (m.awayTeamId === teamId) return { gf: m.awayGoals, ga: m.homeGoals }
  return null
}

/** 본선 경기(조별+토너먼트, 정규시간 스코어 기준)로 한 팀의 전적을 집계한다. 승부차기는 무승부로 센다(FIFA 관행). */
export function computeFinalsRecord(
  teamId: string,
  groupMatches: GroupMatch[],
  knockoutMatches: KnockoutMatch[],
): Pick<TeamEditionRecord, 'gp' | 'w' | 'd' | 'l' | 'gf' | 'ga'> {
  let gp = 0,
    w = 0,
    d = 0,
    l = 0,
    gf = 0,
    ga = 0
  for (const m of [...groupMatches, ...knockoutMatches]) {
    const g = goalsFor(teamId, m)
    if (!g) continue
    gp++
    gf += g.gf
    ga += g.ga
    if (g.gf > g.ga) w++
    else if (g.gf === g.ga) d++
    else l++
  }
  return { gp, w, d, l, gf, ga }
}

/** 최종 도달 라운드 라벨을 구한다. */
export function roundReachedFor(
  teamId: string,
  knockoutMatches: KnockoutMatch[],
  champion: string | null,
  qualified: boolean,
): string {
  if (!qualified) return '예선 탈락'
  const played = knockoutMatches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
  if (played.length === 0) return '조별리그'
  if (champion === teamId) return '우승'
  if (played.some((m) => m.round === 'FINAL')) return '준우승'
  const third = played.find((m) => m.round === 'THIRD')
  if (third) return third.winnerTeamId === teamId ? '3위' : '4위'
  let bestDepth = 0
  let label = '32강'
  for (const m of played) {
    const depth = ROUND_DEPTH[m.round] ?? 0
    if (depth > bestDepth) {
      bestDepth = depth
      label = ROUND_LABEL[m.round]
    }
  }
  return label
}

/** FIFA 점수 맵을 등수 맵으로 변환한다(점수 내림차순, 동점은 팀ID). */
export function rankMapFromPoints(points: Record<string, number>): Record<string, number> {
  const sorted = Object.keys(points).sort((a, b) => points[b] - points[a] || a.localeCompare(b))
  const out: Record<string, number> = {}
  sorted.forEach((id, i) => (out[id] = i + 1))
  return out
}

/**
 * 한 대회(에디션)의 국가별 성적 스냅샷을 만든다. 커리어 모드에서 다음 대회로 넘어갈 때 역대 기록에 축적한다.
 * endPoints(대회 종료 FIFA 점수)로 순위를, qualified48/본선 경기로 전적을 계산한다.
 */
export function buildEditionSnapshot(args: {
  year: number
  hostIds: string[]
  champion: string | null
  qualified48: string[]
  groupMatches: GroupMatch[]
  knockoutMatches: KnockoutMatch[]
  endPoints: Record<string, number>
}): EditionRecord {
  const { year, hostIds, champion, qualified48, groupMatches, knockoutMatches, endPoints } = args
  const qualified = new Set(qualified48)
  const rankMap = rankMapFromPoints(endPoints)
  const byTeam: Record<string, TeamEditionRecord> = {}
  const teamIds = new Set<string>([...Object.keys(endPoints), ...qualified48])
  for (const id of teamIds) {
    const q = qualified.has(id)
    const rec = computeFinalsRecord(id, groupMatches, knockoutMatches)
    byTeam[id] = {
      qualified: q,
      roundReached: roundReachedFor(id, knockoutMatches, champion, q),
      ...rec,
      rank: rankMap[id] ?? null,
      points: endPoints[id] != null ? Math.round(endPoints[id]) : null,
    }
  }
  return { year, hostIds, champion, byTeam }
}

/** 여러 대회 기록에서 한 국가의 통산 집계를 계산한다. */
export interface TeamAllTimeStats {
  editions: number
  qualifiedCount: number
  titles: number
  bestFinish: string
  gp: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  winPct: number
  /** 순위 시계열(연도 오름차순) — null 순위는 제외 */
  rankTrend: Array<{ year: number; rank: number }>
  bestRank: { rank: number; year: number } | null
  worstRank: { rank: number; year: number } | null
  avgRank: number | null
}

const FINISH_ORDER = ['우승', '준우승', '3위', '4위', '8강', '16강', '32강', '조별리그', '예선 탈락']
function betterFinish(a: string, b: string): string {
  return FINISH_ORDER.indexOf(a) <= FINISH_ORDER.indexOf(b) ? a : b
}

export function aggregateTeamHistory(editions: EditionRecord[], teamId: string): TeamAllTimeStats {
  let qualifiedCount = 0,
    titles = 0,
    gp = 0,
    w = 0,
    d = 0,
    l = 0,
    gf = 0,
    ga = 0
  let bestFinish = '예선 탈락'
  const rankTrend: Array<{ year: number; rank: number }> = []
  for (const ed of editions) {
    const rec = ed.byTeam[teamId]
    if (!rec) continue
    if (rec.qualified) qualifiedCount++
    if (ed.champion === teamId) titles++
    gp += rec.gp
    w += rec.w
    d += rec.d
    l += rec.l
    gf += rec.gf
    ga += rec.ga
    bestFinish = betterFinish(bestFinish, rec.roundReached)
    if (rec.rank != null) rankTrend.push({ year: ed.year, rank: rec.rank })
  }
  rankTrend.sort((a, b) => a.year - b.year)
  const ranks = rankTrend.map((r) => r.rank)
  const bestRank = rankTrend.length ? rankTrend.reduce((m, r) => (r.rank < m.rank ? r : m)) : null
  const worstRank = rankTrend.length ? rankTrend.reduce((m, r) => (r.rank > m.rank ? r : m)) : null
  const avgRank = ranks.length ? ranks.reduce((s, r) => s + r, 0) / ranks.length : null
  return {
    editions: editions.filter((ed) => ed.byTeam[teamId]).length,
    qualifiedCount,
    titles,
    bestFinish,
    gp,
    w,
    d,
    l,
    gf,
    ga,
    winPct: gp > 0 ? (w / gp) * 100 : 0,
    rankTrend,
    bestRank,
    worstRank,
    avgRank,
  }
}
