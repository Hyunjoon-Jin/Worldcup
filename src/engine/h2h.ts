/**
 * 상대전적(맞대결 기록) 집계 (E). 이번 사이클에 치른 모든 경기(월드컵 예선·대륙간 PO·친선·월드컵
 * 본선·대륙컵)를 한 팀 관점에서 상대별로 묶어 승·무·패와 득·실을 집계한다. 순수 함수라 주입된
 * 경기 목록만으로 테스트할 수 있다.
 *
 * 승/무/패 판정은 앱의 다른 화면과 동일한 규약을 따른다:
 * - winnerTeamId가 있는 경기(녹아웃·PO 등 결착 경기)는 승자로 승/패를 가른다(승부차기 포함).
 * - winnerTeamId가 없는 경기(조별·친선)는 정규 스코어로 가른다(동점이면 무).
 */

export type H2HCompetition = 'qual' | 'playoff' | 'friendly' | 'wc' | 'cup'

export const H2H_COMPETITION_LABEL: Record<H2HCompetition, string> = {
  qual: '월드컵 예선',
  playoff: '대륙간 PO',
  friendly: '친선',
  wc: '월드컵 본선',
  cup: '대륙컵',
}

export interface H2HInputMatch {
  competition: H2HCompetition
  homeTeamId: string
  awayTeamId: string
  homeGoals: number
  awayGoals: number
  wentToPenalties?: boolean
  /** 결착 경기(녹아웃·PO)의 승자. 있으면 스코어 동점이어도 이 값으로 승/패를 가른다. */
  winnerTeamId?: string
}

export type H2HResult = 'W' | 'D' | 'L'

/** 한 팀 관점의 개별 맞대결 경기. */
export interface H2HGame {
  competition: H2HCompetition
  opponentId: string
  isHome: boolean
  goalsFor: number
  goalsAgainst: number
  result: H2HResult
  wentToPenalties: boolean
}

/** 한 상대와의 통산 전적. */
export interface H2HRecord {
  opponentId: string
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  /** 개별 경기(입력 순서 유지). */
  games: H2HGame[]
}

/** 한 팀 관점에서 한 경기의 승/무/패를 판정한다(앱 공통 규약). */
function resultForTeam(teamId: string, m: H2HInputMatch, goalsFor: number, goalsAgainst: number): H2HResult {
  if (m.winnerTeamId) return m.winnerTeamId === teamId ? 'W' : 'L'
  if (goalsFor > goalsAgainst) return 'W'
  if (goalsFor < goalsAgainst) return 'L'
  return 'D'
}

/**
 * 지정 팀의 상대별 통산 전적을 계산한다. 팀이 참가한 경기만 골라 상대별로 묶고, 상대전적(경기 수)이
 * 많은 순 → 팀ID 순으로 정렬해 반환한다.
 */
export function computeHeadToHead(teamId: string, matches: H2HInputMatch[]): H2HRecord[] {
  const byOpp = new Map<string, H2HRecord>()
  for (const m of matches) {
    const isHome = m.homeTeamId === teamId
    const isAway = m.awayTeamId === teamId
    if (!isHome && !isAway) continue
    const opponentId = isHome ? m.awayTeamId : m.homeTeamId
    if (opponentId === teamId) continue // 자기 자신과의 경기(데이터 오류) 방어
    const goalsFor = isHome ? m.homeGoals : m.awayGoals
    const goalsAgainst = isHome ? m.awayGoals : m.homeGoals
    const result = resultForTeam(teamId, m, goalsFor, goalsAgainst)

    let rec = byOpp.get(opponentId)
    if (!rec) {
      rec = { opponentId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, games: [] }
      byOpp.set(opponentId, rec)
    }
    rec.played++
    if (result === 'W') rec.wins++
    else if (result === 'D') rec.draws++
    else rec.losses++
    rec.goalsFor += goalsFor
    rec.goalsAgainst += goalsAgainst
    rec.games.push({ competition: m.competition, opponentId, isHome, goalsFor, goalsAgainst, result, wentToPenalties: m.wentToPenalties ?? false })
  }
  return [...byOpp.values()].sort((a, b) => b.played - a.played || a.opponentId.localeCompare(b.opponentId))
}

/** 여러 상대전적 레코드를 합친 통산 요약(전체 상대 합계). */
export interface H2HSummary {
  opponents: number
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
}

export function summarizeHeadToHead(records: H2HRecord[]): H2HSummary {
  const s: H2HSummary = { opponents: records.length, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }
  for (const r of records) {
    s.played += r.played
    s.wins += r.wins
    s.draws += r.draws
    s.losses += r.losses
    s.goalsFor += r.goalsFor
    s.goalsAgainst += r.goalsAgainst
  }
  return s
}
