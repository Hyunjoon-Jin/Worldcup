import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { ratingsFromRank } from '../../data/teams'
import { clamp } from '../config'
import type { AllQualificationResult } from './index'
import type { QualMatch } from '../../types/qualification'
import type { GroupMatch, KnockoutMatch, KnockoutRound } from '../../types/match'
import type { TeamRatings } from '../../types/team'

/**
 * 실제 FIFA/코카콜라 세계 랭킹(2018 개정, "SUM" 방식)을 그대로 반영하는 점수 엔진.
 *
 *   P_after = P_before + I × (W − Wₑ)
 *
 * - I: 경기 중요도 계수(월드컵 예선 = 25).
 * - W: 경기 결과(승 1 · 무 0.5 · 패 0. 승부차기 승 0.75 · 패 0.5).
 * - Wₑ: 기대 승점 = 1 / (10^(−dr/600) + 1),  dr = 팀 점수 − 상대 점수.
 * FIFA 실제 방식대로 골 득실차는 반영하지 않는다(승/무/패만). 승부차기 규칙까지 반영한다.
 * 시작 점수(basePointsFromRank)만 근사이고, 갱신 방식은 FIFA 공식 그대로다.
 *
 * A7(홈/중립 미적용): 실제 FIFA 랭킹은 홈/원정·중립지 여부를 점수 산정에 반영하지 않는다.
 * 경기 시뮬레이션의 홈 이점(hostAdvantage)은 "경기 결과"에만 영향을 주며, 여기 랭킹 점수 갱신
 * 공식에는 홈 보정이 전혀 들어가지 않는다(승/무/패와 점수차만 사용).
 */

/**
 * 실제 FIFA/코카콜라 랭킹 경기 중요도 계수 I 전체 표(A1). 현재 시뮬레이션은 월드컵 예선·본선만
 * 치르므로 qualifier·worldCup* 만 사용하지만, 친선·네이션스리그·대륙 본선까지 규정값을 한곳에
 * 정의해 두어 향후 확장 시 이 표만 참조하면 되도록 한다(상수 단일 출처, A5).
 */
export const MATCH_IMPORTANCE = {
  /** 친선(A매치 기간 밖) */
  friendlyOutsideWindow: 5,
  /** 친선(A매치 기간 안) */
  friendlyInWindow: 10,
  /** 네이션스리그 조별 */
  nationsLeagueGroup: 15,
  /** 네이션스리그 결선(플레이오프·결승) */
  nationsLeagueKnockout: 25,
  /** 월드컵·대륙 예선 */
  qualifier: 25,
  /** 대륙 본선 ~16강 */
  continentalGroup: 35,
  /** 대륙 본선 8강~ */
  continentalKnockout: 40,
  /** 월드컵 본선 조별·16강 */
  worldCupGroup: 50,
  /** 월드컵 본선 8강~ */
  worldCupKnockout: 60,
} as const
export type MatchImportanceKey = keyof typeof MATCH_IMPORTANCE

/** 경기 중요도 계수 I (월드컵 예선). */
export const IMPORTANCE_QUALIFIER = MATCH_IMPORTANCE.qualifier
/** 월드컵 본선 조별리그·16강까지의 중요도(실제 FIFA 규정값). */
export const IMPORTANCE_WC_GROUP = MATCH_IMPORTANCE.worldCupGroup
/** 월드컵 본선 8강 이후(준결승·결승 등)의 중요도(실제 FIFA 규정값). */
export const IMPORTANCE_WC_KO = MATCH_IMPORTANCE.worldCupKnockout

/** 본선 토너먼트 라운드별 중요도. 8강(QF)부터 60, 그 전(32강·16강)은 50. */
export function wcKnockoutImportance(round: KnockoutRound): number {
  return round === 'QF' || round === 'SF' || round === 'THIRD' || round === 'FINAL' ? IMPORTANCE_WC_KO : IMPORTANCE_WC_GROUP
}

/**
 * 점수 산정 상수(A5 단일 출처). FIFA_DIVISOR는 실제 규정값(600). 시작 점수 곡선(TOP/PER_RANK/FLOOR)은
 * 실제 FIFA 포인트 분포에 대한 보정 근사이며, 팀별 실측 포인트가 있으면 A2 오버라이드가 우선한다.
 */
export const RANKING_CONSTANTS = {
  /** 기대 승점 산정 분모(FIFA 규정값). */
  fifaDivisor: 600,
  /** 랭킹 1위 근사 점수. */
  topPoints: 1850,
  /** 랭킹당 하락폭(선형 근사). */
  pointsPerRank: 5,
  /** 하위권 시작 점수 하한. */
  floorPoints: 820,
} as const
const FIFA_DIVISOR = RANKING_CONSTANTS.fifaDivisor
const TOP_POINTS = RANKING_CONSTANTS.topPoints
const POINTS_PER_RANK = RANKING_CONSTANTS.pointsPerRank
const FLOOR_POINTS = RANKING_CONSTANTS.floorPoints

/** FIFA 랭킹(숫자 작을수록 강함) → 시작 랭킹 점수(높을수록 강함). 실제 상위권 분포에 근사. */
export function basePointsFromRank(rank: number): number {
  return Math.max(FLOOR_POINTS, TOP_POINTS - rank * POINTS_PER_RANK)
}

/** 랭킹 점수 → 유효 랭킹(전력 곡선 입력용). 점수가 높을수록 낮은(=강한) 랭킹 숫자. */
export function effectiveRankFromPoints(points: number): number {
  return Math.max(1, (TOP_POINTS - points) / POINTS_PER_RANK)
}

/** FIFA 기대 승점 Wₑ = 1 / (10^(−dr/600) + 1). */
export function expectedResult(teamPoints: number, oppPoints: number): number {
  return 1 / (Math.pow(10, -(teamPoints - oppPoints) / FIFA_DIVISOR) + 1)
}

/** 표시용 점수(A8): 내부 계산은 소수로 유지하고, 화면에는 이 함수로 정수 반올림해 일관 표기한다. */
export function displayPoints(points: number): number {
  return Math.round(points)
}

/**
 * 한 경기 결과로 두 팀의 FIFA 랭킹 점수를 제자리 갱신한다(실제 SUM 공식).
 * 정규 결과는 제로섬(W+W'=1), 승부차기는 W 0.75/0.5라 양팀 모두 상승할 수 있다.
 *
 * 규정 정밀화(Phase 2):
 * - A3 무감점 특례: FIFA는 본선에서도 공식을 그대로 적용한다. 승리(W=1)면 dr에 무관하게
 *   ΔP = I·(1−Wₑ) > 0 이므로 "이겨서 점수가 깎이는" 일은 구조적으로 없다(별도 캡 불필요).
 * - A4 승부차기/연장: 골 차가 나면(연장 승리 포함) 정규 승/패(W 1/0), 무승부 후 승부차기면
 *   wentToPenalties로 W 0.75/0.5. 본 시뮬은 무승부→승부차기로 모델링하므로 이 처리가 정확하다.
 */
export function applyMatchElo(
  points: Record<string, number>,
  m: { homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number; wentToPenalties?: boolean; winnerTeamId?: string },
  importance: number = IMPORTANCE_QUALIFIER,
): void {
  const h = points[m.homeTeamId]
  const a = points[m.awayTeamId]
  if (h == null || a == null) return
  let wHome: number
  let wAway: number
  if (m.wentToPenalties && m.winnerTeamId) {
    // 승부차기: 승자 0.75, 패자 0.5
    wHome = m.winnerTeamId === m.homeTeamId ? 0.75 : 0.5
    wAway = m.winnerTeamId === m.awayTeamId ? 0.75 : 0.5
  } else {
    wHome = m.homeGoals > m.awayGoals ? 1 : m.homeGoals < m.awayGoals ? 0 : 0.5
    wAway = 1 - wHome
  }
  points[m.homeTeamId] = h + importance * (wHome - expectedResult(h, a))
  points[m.awayTeamId] = a + importance * (wAway - expectedResult(a, h))
}

/**
 * 한 팀의 정적 시작 점수(A2·B12). 실측 FIFA 포인트(fifaPointsApprox)가 있으면 그대로 쓰고,
 * 없으면 순위 근사 곡선(basePointsFromRank)으로 채운다. 순위 데이터도 없으면 100위로 방어한다.
 */
export function staticStartPoints(teamId: string): number {
  const nation = ALL_NATIONS_BY_ID[teamId]
  if (nation?.fifaPointsApprox != null) return nation.fifaPointsApprox
  return basePointsFromRank(nation?.fifaRankApprox ?? 100)
}

/** 참가국들의 초기 Elo 점수 맵(실측 포인트 우선, 없으면 순위 근사). */
export function initRankingPoints(teamIds: string[]): Record<string, number> {
  const p: Record<string, number> = {}
  for (const id of teamIds) p[id] = staticStartPoints(id)
  return p
}

/**
 * 시작 점수 맵을 만든다. carried(이전 대회에서 이월된 FIFA 점수)가 있으면 그 값을 우선 쓰고,
 * 없는 팀만 정적 시작 점수(실측 포인트 → 순위 근사)로 채운다. 커리어 모드에서 대회를 거듭해도
 * FIFA 점수가 이어지도록(본선 성적이 다음 대회로 회귀하지 않도록) 한다.
 */
export function resolveBasePoints(teamIds: string[], carried?: Record<string, number>): Record<string, number> {
  const p: Record<string, number> = {}
  for (const id of teamIds) {
    p[id] = carried?.[id] ?? staticStartPoints(id)
  }
  return p
}

/**
 * 비활동 감쇠(옵션, C17). 실제 FIFA엔 없는 규칙이라 기본 factor=0(무동작)이다. 장기 미경기 팀의
 * 점수를 아주 천천히 시작 점수 쪽으로 되돌리고 싶을 때만 factor>0으로 켠다(playedCount=0 팀만 대상).
 * 원본 불변 — 새 맵을 반환한다.
 */
export function applyInactivityDecay(
  points: Record<string, number>,
  playedCount: Record<string, number>,
  factor = 0,
): Record<string, number> {
  if (factor <= 0) return { ...points }
  const f = Math.min(1, factor)
  const out: Record<string, number> = {}
  for (const [id, p] of Object.entries(points)) {
    if ((playedCount[id] ?? 0) > 0) {
      out[id] = p
    } else {
      const base = staticStartPoints(id)
      out[id] = p + (base - p) * f // 미경기 팀만 시작 점수 쪽으로 f만큼 회귀
    }
  }
  return out
}

/** 초기 점수에서 경기들을 순서대로 적용한 새 점수 맵을 만든다(원본 불변). */
export function updateRankingPoints(basePoints: Record<string, number>, matches: QualMatch[]): Record<string, number> {
  const p = { ...basePoints }
  for (const m of matches) applyMatchElo(p, m)
  return p
}

/** 본선 진행 결과(조별리그 + 토너먼트)를 담는다. FIFA 랭킹에 본선 성적을 반영할 때 쓴다. */
export interface FinalsResults {
  groupMatches: GroupMatch[]
  knockoutMatches: KnockoutMatch[]
}

/**
 * 월드컵 본선 경기(조별리그 I=50, 8강 이후 I=60)를 점수 맵에 제자리로 누적 적용한다.
 * 예선과 동일한 SUM 공식을 쓰되 본선 중요도를 적용해, 본선 성적이 FIFA 랭킹에 반영되게 한다.
 */
export function applyFinalsElo(points: Record<string, number>, finals: FinalsResults): void {
  for (const m of finals.groupMatches) applyMatchElo(points, m, IMPORTANCE_WC_GROUP)
  for (const m of finals.knockoutMatches) applyMatchElo(points, m, wcKnockoutImportance(m.round))
}

/** 대륙별 대표 대회(대륙컵) 경기 — 조별 I=35, 녹아웃 I=40. FIFA 랭킹에 대륙컵 성적을 반영한다. */
export interface ContinentalResults {
  groupMatches: Array<{ homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number }>
  knockoutMatches: Array<{ homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number; wentToPenalties?: boolean; winnerTeamId?: string }>
}

/** 대륙컵 경기(조별 continentalGroup=35, 녹아웃 continentalKnockout=40)를 점수 맵에 제자리로 누적 적용한다. */
export function applyContinentalElo(points: Record<string, number>, cr: ContinentalResults): void {
  for (const m of cr.groupMatches) applyMatchElo(points, m, MATCH_IMPORTANCE.continentalGroup)
  for (const m of cr.knockoutMatches) applyMatchElo(points, m, MATCH_IMPORTANCE.continentalKnockout)
}

/**
 * 한 대회(예선 전체 + 본선 전체)가 끝난 뒤의 FIFA 점수 맵을 계산한다(커리어 이월용).
 * carried(이전 대회 이월 점수)를 시작점으로, 이번 대회 모든 예선 경기와 본선 경기를 누적 적용한다.
 * 결과를 다음 대회의 시작 점수로 저장하면, 본선까지 반영된 랭킹이 다음 대회로 이어진다.
 * 이번 대회에 참가하지 않은 국가도 이월 점수를 그대로 유지하도록 모든 국가를 포함한다.
 */
export function editionEndRankingPoints(
  all: AllQualificationResult,
  finals: FinalsResults,
  carriedBase?: Record<string, number>,
): Record<string, number> {
  const ids = Object.keys(ALL_NATIONS_BY_ID)
  const points = resolveBasePoints(ids, carriedBase)
  const allQual = Object.values(all.byConfederation)
    .flatMap((r) => r.matches)
    .sort((a, b) => a.matchday - b.matchday)
  for (const m of allQual) applyMatchElo(points, m)
  // 대륙간 플레이오프 경기도 예선 중요도(I=25)로 반영한다(누락 시 대륙간 PO 승자의 랭킹 크레딧이 빠짐).
  for (const m of all.interConfed.matches) applyMatchElo(points, m)
  applyFinalsElo(points, finals)
  return points
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
export function computeRankingMovers(
  all: AllQualificationResult,
  played: QualMatch[],
  carriedBase?: Record<string, number>,
): RankMover[] {
  const teamIds = new Set<string>()
  for (const c of Object.keys(all.byConfederation)) {
    for (const m of all.byConfederation[c].matches) {
      teamIds.add(m.homeTeamId)
      teamIds.add(m.awayTeamId)
    }
  }
  if (carriedBase) for (const id of Object.keys(carriedBase)) teamIds.add(id)
  const ids = [...teamIds]
  // 대회 시작 점수 = 이월(carried) 점수(커리어 모드). 없으면 정적 시작 점수. computeLiveRanking과 기준 일치.
  const base = resolveBasePoints(ids, carriedBase)
  const now = updateRankingPoints(base, played)

  const rankOf = (pts: Record<string, number>) => {
    const sorted = [...ids].sort(
      (a, b) => pts[b] - pts[a] || ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox || a.localeCompare(b),
    )
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
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.points - a.points || a.teamId.localeCompare(b.teamId))
}

/** 전체 예선 참가국 ID 목록. */
export function qualParticipantIds(all: AllQualificationResult): string[] {
  const ids = new Set<string>()
  for (const c of Object.keys(all.byConfederation)) {
    for (const m of all.byConfederation[c].matches) {
      ids.add(m.homeTeamId)
      ids.add(m.awayTeamId)
    }
  }
  return [...ids]
}

function rankMap(ids: string[], pts: Record<string, number>): Record<string, number> {
  const sorted = [...ids].sort(
    (a, b) => pts[b] - pts[a] || ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox || a.localeCompare(b),
  )
  const r: Record<string, number> = {}
  sorted.forEach((id, i) => (r[id] = i + 1))
  return r
}

export interface LiveRankRow {
  teamId: string
  /** 현재 순위(참가국 내, 1=최강) */
  rank: number
  baseRank: number
  /** 순위 등락(상승 +, 하락 −) */
  rankDelta: number
  /** 현재 FIFA 점수(반올림) */
  points: number
  basePoints: number
  /** 점수 등락 */
  pointsDelta: number
}

/**
 * 실시간 FIFA 랭킹 점수 현황. 이미 치른 예선 경기(played)에 더해, 진행된 본선 경기(finals)까지
 * 반영한 전체 참가국 순위표를 점수순으로 반환한다. 본선 경기는 개최국(예선 미참가)도 포함하므로
 * 개최국이 랭킹에 함께 나타난다.
 */
export function computeLiveRanking(
  all: AllQualificationResult,
  played: QualMatch[],
  finals?: FinalsResults,
  carriedBase?: Record<string, number>,
  friendlies?: ReadonlyArray<{ homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number }>,
  continental?: ContinentalResults,
): LiveRankRow[] {
  const idSet = new Set(qualParticipantIds(all))
  if (finals) {
    for (const m of finals.groupMatches) {
      idSet.add(m.homeTeamId)
      idSet.add(m.awayTeamId)
    }
    for (const m of finals.knockoutMatches) {
      idSet.add(m.homeTeamId)
      idSet.add(m.awayTeamId)
    }
  }
  // 친선전에만 등장하는 팀(개최국 등 예선 미참가국)도 순위표에 포함한다.
  if (friendlies) for (const f of friendlies) { idSet.add(f.homeTeamId); idSet.add(f.awayTeamId) }
  // 대륙컵에만 등장하는 팀(예선 미참가국 등)도 순위표에 포함한다.
  if (continental) for (const m of [...continental.groupMatches, ...continental.knockoutMatches]) { idSet.add(m.homeTeamId); idSet.add(m.awayTeamId) }
  // 이월 점수가 있는 팀(이전 대회 참가국 등)도 순위표에 포함한다.
  if (carriedBase) for (const id of Object.keys(carriedBase)) idSet.add(id)
  const ids = [...idSet]
  const base = resolveBasePoints(ids, carriedBase)
  const now = updateRankingPoints(base, played)
  if (finals) applyFinalsElo(now, finals)
  // 친선전(평가전)도 FIFA 랭킹에 반영한다(A매치 기간 친선 중요도 I=10).
  if (friendlies) for (const f of friendlies) applyMatchElo(now, f, MATCH_IMPORTANCE.friendlyInWindow)
  // 대륙컵 성적도 반영(조별 35·녹아웃 40).
  if (continental) applyContinentalElo(now, continental)
  const baseRanks = rankMap(ids, base)
  const nowRanks = rankMap(ids, now)
  return ids
    .map((id) => ({
      teamId: id,
      rank: nowRanks[id],
      baseRank: baseRanks[id],
      rankDelta: baseRanks[id] - nowRanks[id],
      points: Math.round(now[id]),
      basePoints: Math.round(base[id]),
      pointsDelta: Math.round(now[id] - base[id]),
    }))
    .sort((a, b) => a.rank - b.rank)
}

/**
 * 성적(진행 결과)에 따른 팀별 종합 능력치 가감치(±maxDelta로 소폭). Elo 점수 변동을 능력치 곡선의
 * 종합 능력치 차이로 환산해, 잘 나가면 살짝 오르고 부진하면 살짝 내려가게 한다.
 * played를 진행된 경기까지만 넘기면 실황(일별 진행)까지 반영된다.
 */
/** Elo 점수 변동 1점당 능력치 보정(성적 반영 민감도). 순위 파생·이중 반올림으로 대부분의 팀이 0이 되던
 * 문제를 없애, 성적에 따라 능력치가 눈에 띄게 오르내리도록 점수 변동을 직접 환산한다. */
const OVERALL_PER_ELO_POINT = 0.1

/**
 * 진행된 예선 성적(FIFA Elo 점수 변동)을 능력치 보정으로 환산한다. 잘하면(점수 상승) 능력치가 오르고
 * 부진하면(점수 하락) 내려간다. 평균 기대만큼 한 팀(점수 변동 ≈ 0)은 0으로 유지된다.
 * 예전엔 순위 파생 overall의 차이를 이중 반올림해 약 2/3의 팀이 0으로 뭉개졌는데, 점수 변동을 직접
 * 환산해 대부분의 팀이 성적에 비례한 보정을 받는다.
 */
export function overallDeltasFromResults(
  all: AllQualificationResult,
  played: QualMatch[],
  maxDelta = 6,
): Record<string, number> {
  const ids = qualParticipantIds(all)
  const base = initRankingPoints(ids)
  const now = updateRankingPoints(base, played)
  const out: Record<string, number> = {}
  for (const id of ids) {
    if (!ALL_NATIONS_BY_ID[id]) continue
    const dPoints = (now[id] ?? 0) - (base[id] ?? 0)
    out[id] = Math.max(-maxDelta, Math.min(maxDelta, Math.round(dPoints * OVERALL_PER_ELO_POINT)))
  }
  return out
}

/** Elo 누적 대상 경기(대회 무관 공통 형태). */
export interface EloPlayMatch {
  homeTeamId: string
  awayTeamId: string
  homeGoals: number
  awayGoals: number
  wentToPenalties?: boolean
  winnerTeamId?: string
}

/**
 * 여러 대회의 '치른 경기'를 대회별 중요도로 Elo 누적 적용한 뒤, 점수 변동을 능력치 보정으로 환산한다.
 * 예선뿐 아니라 친선·대륙컵·월드컵 본선 등 '치른 모든 경기'를 반영하므로, 월드컵이 아니어도 매 경기마다
 * 능력치가 조금씩 오르내린다. 변동이 0인 팀은 결과에서 생략한다.
 */
export function overallDeltasFromPlay(
  groups: Array<{ matches: EloPlayMatch[]; importance: number }>,
  maxDelta = 6,
): Record<string, number> {
  const ids = Object.keys(ALL_NATIONS_BY_ID)
  const base = initRankingPoints(ids)
  const points: Record<string, number> = { ...base }
  for (const g of groups) for (const m of g.matches) applyMatchElo(points, m, g.importance)
  const out: Record<string, number> = {}
  for (const id of ids) {
    const d = Math.max(-maxDelta, Math.min(maxDelta, Math.round((points[id] - base[id]) * OVERALL_PER_ELO_POINT)))
    if (d !== 0) out[id] = d
  }
  return out
}

/** 최근 폼 보정 스케일(연승 시 최대 +N, 연패 시 −N). 승/무/패 자체가 소폭 능력치를 움직이게 한다. */
export const FORM_NUDGE_SCALE = 4
/** 오래된 경기일수록 가중치가 줄어드는 감쇠 계수(최근 경기가 가장 크게 반영). */
const FORM_DECAY = 0.72

/**
 * '치른 경기'의 승/무/패 자체로 최근 폼 보정을 만든다(상대 강약과 무관). Elo(overallDeltasFromPlay)는
 * 강팀이 약팀을 이겨도 기대 승점이 커서 점수 변동이 0에 수렴 → 능력치가 거의 안 움직이는데, 사용자가
 * 원한 '매 경기마다 조금씩 오르내리는' 감각을 위해 결과 기반 폼을 소폭 더한다. 최근 경기에 가중치를
 * 크게 둔 지수가중평균(EWMA)이라 연승이면 +, 연패면 −, 승패가 섞이면 그 사이에서 매 경기 진동한다.
 * groups는 대략 시간 순서(예선→친선→대륙컵→본선)로 넘긴다. 승부차기는 절반 강도(±0.5)로 본다.
 */
export function formNudgeDeltasFromPlay(
  groups: Array<{ matches: EloPlayMatch[] }>,
  scale = FORM_NUDGE_SCALE,
): Record<string, number> {
  const seq: Record<string, number[]> = {}
  const push = (id: string, v: number) => { (seq[id] ??= []).push(v) }
  for (const g of groups) {
    for (const m of g.matches) {
      if (m.wentToPenalties && m.winnerTeamId) {
        push(m.homeTeamId, m.winnerTeamId === m.homeTeamId ? 0.5 : -0.5)
        push(m.awayTeamId, m.winnerTeamId === m.awayTeamId ? 0.5 : -0.5)
      } else {
        const oh = m.homeGoals > m.awayGoals ? 1 : m.homeGoals < m.awayGoals ? -1 : 0
        push(m.homeTeamId, oh)
        push(m.awayTeamId, -oh)
      }
    }
  }
  const out: Record<string, number> = {}
  for (const id of Object.keys(seq)) {
    const s = seq[id]
    let num = 0
    let den = 0
    let w = 1
    for (let i = s.length - 1; i >= 0; i--) {
      num += w * s[i]
      den += w
      w *= FORM_DECAY
    }
    const f = den > 0 ? num / den : 0 // 최근 폼 [-1, 1]
    const d = Math.round(f * scale)
    if (d !== 0) out[id] = d
  }
  return out
}

export interface TrendPoint {
  date: string
  label: string
  points: number
  rank: number
}
export interface TeamTrend {
  teamId: string
  series: TrendPoint[]
}

/**
 * 지정 팀들의 FIFA 점수·순위 변동 추이. 캘린더 경기일 순서로 경기를 누적 적용하며 각 시점의
 * 점수/순위를 기록한다(변동 추이 차트용). days는 이미 진행된 경기일만 넘기면 실황까지의 추이가 된다.
 */
export function computeRankingTrend(
  all: AllQualificationResult,
  days: Array<{ date: string; label: string; matches: Array<{ match: QualMatch }> }>,
  teamIds: string[],
  carriedBase?: Record<string, number>,
): TeamTrend[] {
  const idSet = new Set(qualParticipantIds(all))
  if (carriedBase) for (const id of Object.keys(carriedBase)) idSet.add(id)
  const ids = [...idSet]
  const points = resolveBasePoints(ids, carriedBase)
  const trends: TeamTrend[] = teamIds.map((id) => ({ teamId: id, series: [] }))
  // 시작점(경기 전) 기록
  const startRanks = rankMap(ids, points)
  for (const t of trends) {
    t.series.push({ date: '시작', label: '예선 전', points: Math.round(points[t.teamId]), rank: startRanks[t.teamId] })
  }
  for (const day of days) {
    for (const cm of day.matches) applyMatchElo(points, cm.match)
    const ranks = rankMap(ids, points)
    for (const t of trends) {
      t.series.push({ date: day.date, label: day.label, points: Math.round(points[t.teamId]), rank: ranks[t.teamId] })
    }
  }
  return trends
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
