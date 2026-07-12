import { getRatings } from './matchEngine'
import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../data/nations'
import { UPSET_RATING_GAP } from './config'
import type { StatMatch } from './tournamentStats'

export type HighlightType = 'upset' | 'rout' | 'thriller' | 'penalty'

export interface Highlight {
  type: HighlightType
  match: StatMatch
  winnerTeamId: string | null
  /** 정렬용 중요도(클수록 위) */
  importance: number
}

const ROUT_MARGIN = 4
const THRILLER_TOTAL = 6

/**
 * 확정 경기 목록에서 명장면을 골라 중요도순으로 정렬한다 (D5).
 * ratingOf를 주입받아 순수하게 테스트할 수 있다(기본은 실제 getRatings).
 */
export function computeHighlights(
  matches: StatMatch[],
  ratingOf: (teamId: string) => { overall: number } = getRatings,
  limit = 8,
): Highlight[] {
  const highlights: Highlight[] = []

  for (const m of matches) {
    const total = m.homeGoals + m.awayGoals
    const margin = Math.abs(m.homeGoals - m.awayGoals)
    const isDraw = m.homeGoals === m.awayGoals
    const winnerTeamId = isDraw ? null : m.homeGoals > m.awayGoals ? m.homeTeamId : m.awayTeamId

    // 이변: 승자의 종합 능력치가 패자보다 크게 낮음
    if (winnerTeamId) {
      const loserTeamId = winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId
      const gap = ratingOf(loserTeamId).overall - ratingOf(winnerTeamId).overall
      if (gap >= UPSET_RATING_GAP) {
        highlights.push({ type: 'upset', match: m, winnerTeamId, importance: 100 + gap * 2 })
        continue
      }
    }
    // 대량 득점차 완승
    if (!m.wentToPenalties && margin >= ROUT_MARGIN) {
      highlights.push({ type: 'rout', match: m, winnerTeamId, importance: 60 + margin * 3 })
      continue
    }
    // 승부차기 접전
    if (m.wentToPenalties) {
      highlights.push({ type: 'penalty', match: m, winnerTeamId, importance: 50 })
      continue
    }
    // 난타전
    if (total >= THRILLER_TOTAL) {
      highlights.push({ type: 'thriller', match: m, winnerTeamId, importance: 40 + total })
    }
  }

  return highlights.sort((a, b) => b.importance - a.importance).slice(0, limit)
}

const TYPE_META: Record<HighlightType, { icon: string; label: string }> = {
  upset: { icon: '⚡', label: '이변' },
  rout: { icon: '💥', label: '대승' },
  thriller: { icon: '🔥', label: '난타전' },
  penalty: { icon: '🎯', label: '승부차기' },
}

/** 하이라이트를 한 줄 요약 문장으로 만든다. */
export function highlightSummary(h: Highlight): { icon: string; label: string; text: string } {
  const meta = TYPE_META[h.type]
  const home = TEAMS_BY_ID[h.match.homeTeamId]?.nameKo ?? h.match.homeTeamId
  const away = TEAMS_BY_ID[h.match.awayTeamId]?.nameKo ?? h.match.awayTeamId
  const score = `${h.match.homeGoals}-${h.match.awayGoals}`
  const suffix = h.match.wentToPenalties ? ' (승부차기)' : ''
  return { icon: meta.icon, label: meta.label, text: `${h.match.label} · ${home} ${score} ${away}${suffix}` }
}
