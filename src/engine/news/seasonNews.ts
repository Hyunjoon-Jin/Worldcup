import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { josa } from '../upsetArticle'
import { computeHighlights, type HighlightType } from '../highlights'
import { extractQualDrama } from '../qualification/drama'
import type { AllQualificationResult } from '../qualification'
import type { StatMatch } from '../tournamentStats'
import type { LiveRankRow } from '../qualification/ranking'

/**
 * 시즌 내러티브(뉴스) 자동 생성 (D). 진행 이벤트를 한국어 헤드라인으로 서사화한다. LLM·API 없이
 * 진행 데이터를 문장 템플릿에 대입해 결정론적으로 만든다(같은 상황 → 같은 헤드라인). 순수 함수라
 * 주입된 데이터만으로 테스트할 수 있다.
 */

export type NewsCategory = 'champion' | 'upset' | 'qualIn' | 'qualOut' | 'rankUp' | 'rankDown' | 'streakWin' | 'streakLoss' | 'crisis'

export interface NewsItem {
  /** 안정적 식별자(React key·중복 제거용). */
  id: string
  category: NewsCategory
  /** 헤드라인 앞 이모지. */
  icon: string
  /** 한국어 헤드라인(조사 처리 포함). */
  headline: string
  /** 관련 팀 ID(국기·팀 링크 표시용). 대표 팀이 맨 앞. */
  teamIds: string[]
  /** 정렬용 중요도(클수록 위). */
  importance: number
}

/** 뉴스 생성 입력 — 있는 것만 넣으면 되고, 없는 신호는 건너뛴다. */
export interface SeasonNewsInput {
  /** 월드컵 우승국(확정 시). */
  wcChampion?: string | null
  wcYear?: number
  /** 대륙컵 우승(확정 시). */
  continentalChampion?: { teamId: string; cupNameKo: string; year?: number } | null
  /** 지역예선 결과 — 깜짝 진출/충격 탈락 드라마 추출용. */
  qualResult?: AllQualificationResult | null
  /** 지역예선이 완전히 끝났을 때만 진출/탈락 뉴스를 낸다(스포일러 방지). */
  qualComplete?: boolean
  /** 이미 치른 경기들(예선+친선+본선, 시간순) — 이변/명장면·연승연패 산출용. */
  playedMatches?: NewsMatch[]
  /** 능력치 조회(이변 판정용). 기본은 highlights의 getRatings. */
  ratingOf?: (teamId: string) => { overall: number }
  /** 라이브 FIFA 랭킹 행 — 순위 급등/급락 산출용. */
  liveRanking?: LiveRankRow[]
  /** 조별리그 탈락 위기 팀(진출 확률%). */
  crisisTeams?: { teamId: string; pct: number }[]
}

export interface NewsMatch {
  homeTeamId: string
  awayTeamId: string
  homeGoals: number
  awayGoals: number
  wentToPenalties?: boolean
}

const nameOf = (id: string) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id

/** 순위 급등/급락으로 헤드라인을 낼 최소 계단 수(≈210개국 기준). */
const RANK_MOVE_THRESHOLD = 10
/** 연승/연패로 헤드라인을 낼 최소 연속 수. */
const STREAK_THRESHOLD = 3
/** 이변 명장면 중 뉴스로 승격할 유형(완승·난타전 제외, 진짜 이변·승부차기 접전만). */
const NEWS_HIGHLIGHT_TYPES: HighlightType[] = ['upset', 'penalty']

/** 팀별 마지막 연속 결과(연승/연패)를 구한다. playedMatches는 시간순으로 넘긴다. */
function trailingStreaks(matches: NewsMatch[]): Record<string, { kind: 'W' | 'L'; run: number }> {
  const seq: Record<string, ('W' | 'D' | 'L')[]> = {}
  const push = (id: string, r: 'W' | 'D' | 'L') => {
    ;(seq[id] ??= []).push(r)
  }
  for (const m of matches) {
    if (m.wentToPenalties) {
      // 승부차기는 무승부 후 결정 — 연승/연패 연속을 끊는 무승부로 취급(폼 신화 방지).
      push(m.homeTeamId, 'D')
      push(m.awayTeamId, 'D')
      continue
    }
    if (m.homeGoals === m.awayGoals) {
      push(m.homeTeamId, 'D')
      push(m.awayTeamId, 'D')
    } else if (m.homeGoals > m.awayGoals) {
      push(m.homeTeamId, 'W')
      push(m.awayTeamId, 'L')
    } else {
      push(m.homeTeamId, 'L')
      push(m.awayTeamId, 'W')
    }
  }
  const out: Record<string, { kind: 'W' | 'L'; run: number }> = {}
  for (const [id, arr] of Object.entries(seq)) {
    const last = arr[arr.length - 1]
    if (last !== 'W' && last !== 'L') continue
    let run = 0
    for (let i = arr.length - 1; i >= 0 && arr[i] === last; i--) run++
    if (run >= STREAK_THRESHOLD) out[id] = { kind: last, run }
  }
  return out
}

/**
 * 진행 상황에서 시즌 뉴스 헤드라인을 생성해 중요도순으로 반환한다. 각 신호(우승·이변·예선 드라마·
 * 순위 급변·연승연패·위기)를 헤드라인으로 만들어 합친 뒤, 중요도 내림차순으로 정렬해 상위 limit개를 준다.
 */
export function generateSeasonNews(input: SeasonNewsInput, limit = 8): NewsItem[] {
  const items: NewsItem[] = []

  // 1) 우승 — 가장 큰 뉴스.
  if (input.wcChampion) {
    const nm = nameOf(input.wcChampion)
    items.push({
      id: `champ-wc-${input.wcYear ?? ''}-${input.wcChampion}`,
      category: 'champion',
      icon: '🏆',
      headline: `${nm}, ${input.wcYear ? `${input.wcYear} ` : ''}월드컵 정상 등극 — 세계를 제패하다`,
      teamIds: [input.wcChampion],
      importance: 1000,
    })
  }
  if (input.continentalChampion) {
    const { teamId, cupNameKo, year } = input.continentalChampion
    items.push({
      id: `champ-cup-${cupNameKo}-${year ?? ''}-${teamId}`,
      category: 'champion',
      icon: '🌍',
      headline: `${nameOf(teamId)}, ${cupNameKo}${year ? ` ${year}` : ''} 우승`,
      teamIds: [teamId],
      importance: 900,
    })
  }

  // 2) 예선 드라마 — 완전히 끝났을 때만(스포일러 방지).
  if (input.qualResult && input.qualComplete) {
    const drama = extractQualDrama(input.qualResult, 3)
    for (const t of drama.shockEliminations) {
      items.push({
        id: `qout-${t.teamId}`,
        category: 'qualOut',
        icon: '😱',
        headline: `${nameOf(t.teamId)}, 충격의 예선 탈락 — FIFA ${t.rank}위의 몰락`,
        teamIds: [t.teamId],
        importance: 600 + (31 - Math.min(30, t.rank)), // 상위권일수록 큰 뉴스
      })
    }
    for (const t of drama.surpriseQualifiers) {
      items.push({
        id: `qin-${t.teamId}`,
        category: 'qualIn',
        icon: '🎉',
        headline: `${nameOf(t.teamId)}, 예상 밖 본선 진출 — 랭킹 ${t.rank}위의 반란`,
        teamIds: [t.teamId],
        importance: 500 + Math.min(120, t.rank), // 하위권일수록 큰 이변
      })
    }
  }

  // 3) 이변/명장면 — 치른 경기에서 진짜 이변·승부차기 접전을 뽑는다.
  if (input.playedMatches && input.playedMatches.length > 0) {
    // 능력치 조회는 실재 팀만 가능하므로, 양팀이 모두 등록된 경기만 이변 판정 대상으로 삼는다(방어).
    const stat: StatMatch[] = input.playedMatches
      .filter((m) => ALL_NATIONS_BY_ID[m.homeTeamId] && ALL_NATIONS_BY_ID[m.awayTeamId])
      .map((m) => ({
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        label: '',
        wentToPenalties: m.wentToPenalties ?? false,
      }))
    const highlights = input.ratingOf ? computeHighlights(stat, input.ratingOf, 20) : computeHighlights(stat, undefined, 20)
    for (const h of highlights) {
      if (!NEWS_HIGHLIGHT_TYPES.includes(h.type) || !h.winnerTeamId) continue
      const winner = h.winnerTeamId
      const loser = winner === h.match.homeTeamId ? h.match.awayTeamId : h.match.homeTeamId
      if (h.type === 'upset') {
        items.push({
          id: `upset-${winner}-${loser}-${h.match.homeGoals}${h.match.awayGoals}`,
          category: 'upset',
          icon: '⚡',
          headline: `이변! ${nameOf(winner)}, ${josa(nameOf(loser), '을', '를')} 잡다`,
          teamIds: [winner, loser],
          importance: Math.min(590, h.importance + 300), // 우승·예선 드라마 아래로
        })
      } else {
        // penalty
        items.push({
          id: `pk-${winner}-${loser}`,
          category: 'upset',
          icon: '🎯',
          headline: `${nameOf(winner)}, 승부차기 접전 끝에 ${josa(nameOf(loser), '을', '를')} 꺾다`,
          teamIds: [winner, loser],
          importance: 250 + h.importance,
        })
      }
    }
  }

  // 4) 순위 급등/급락 — 라이브 랭킹 등락.
  if (input.liveRanking) {
    for (const row of input.liveRanking) {
      if (row.rankDelta >= RANK_MOVE_THRESHOLD) {
        items.push({
          id: `rankup-${row.teamId}`,
          category: 'rankUp',
          icon: '📈',
          headline: `${nameOf(row.teamId)}, FIFA 랭킹 ${row.rankDelta}계단 급상승`,
          teamIds: [row.teamId],
          importance: 200 + row.rankDelta * 3,
        })
      } else if (row.rankDelta <= -RANK_MOVE_THRESHOLD) {
        items.push({
          id: `rankdown-${row.teamId}`,
          category: 'rankDown',
          icon: '📉',
          headline: `${nameOf(row.teamId)}, FIFA 랭킹 ${Math.abs(row.rankDelta)}계단 하락`,
          teamIds: [row.teamId],
          importance: 190 + Math.abs(row.rankDelta) * 3,
        })
      }
    }
  }

  // 5) 연승/연패.
  if (input.playedMatches && input.playedMatches.length > 0) {
    const streaks = trailingStreaks(input.playedMatches)
    for (const [teamId, s] of Object.entries(streaks)) {
      if (s.kind === 'W') {
        items.push({
          id: `streakW-${teamId}`,
          category: 'streakWin',
          icon: '🔥',
          headline: `${nameOf(teamId)}, ${s.run}연승 질주`,
          teamIds: [teamId],
          importance: 150 + s.run * 15,
        })
      } else {
        items.push({
          id: `streakL-${teamId}`,
          category: 'streakLoss',
          icon: '🧊',
          headline: `${nameOf(teamId)}, ${s.run}연패 수렁`,
          teamIds: [teamId],
          importance: 140 + s.run * 15,
        })
      }
    }
  }

  // 6) 조별리그 탈락 위기.
  if (input.crisisTeams) {
    for (const c of input.crisisTeams) {
      items.push({
        id: `crisis-${c.teamId}`,
        category: 'crisis',
        icon: '⚠️',
        headline: `${nameOf(c.teamId)}, 조별리그 탈락 위기 — 진출 확률 ${Math.round(c.pct)}%`,
        teamIds: [c.teamId],
        importance: 300 + (50 - Math.min(50, c.pct)),
      })
    }
  }

  // 중복 id 제거(같은 신호가 여러 경로로 잡히는 경우 방어) 후 중요도순 정렬.
  const seen = new Set<string>()
  const deduped = items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)))
  deduped.sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id))
  return deduped.slice(0, limit)
}
