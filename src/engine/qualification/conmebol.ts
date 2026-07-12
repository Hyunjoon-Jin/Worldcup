import { nationsByConfederation } from '../../data/nations'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { QUALIFIER_HOME_ADVANTAGE } from '../config'
import { simulateScoreRaw, type RandomFn } from '../matchCore'
import { rankGroupTeams } from '../tiebreakers'
import type { MatchResult } from '../../types/match'
import type { TeamRatings } from '../../types/team'
import type { QualificationResult } from '../../types/qualification'

/**
 * CONMEBOL(남미) 예선 (지역예선 Q2, 수직 슬라이스). 10개국 단일 라운드로빈(홈&어웨이)을
 * 시뮬레이션하고, 타이브레이커로 순위를 매겨 상위 6국 직행 + 7위 대륙간 PO를 가린다.
 *
 * 순수 함수: store를 읽지 않고 능력치 맵과 난수 함수만 받는다(#42 엔진 방식 재사용).
 */
export function simulateConmebol(ratings: Record<string, TeamRatings>, rand: RandomFn): QualificationResult {
  const teams = nationsByConfederation('CONMEBOL').map((t) => t.id)
  const matches: MatchResult[] = []

  // 모든 팀이 서로 홈&어웨이 2경기씩(단일리그)
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      for (const [home, away] of [
        [teams[i], teams[j]],
        [teams[j], teams[i]],
      ] as const) {
        const s = simulateScoreRaw(ratings[home], ratings[away], QUALIFIER_HOME_ADVANTAGE, 0, rand)
        matches.push({ homeTeamId: home, awayTeamId: away, homeGoals: s.homeGoals, awayGoals: s.awayGoals })
      }
    }
  }

  const standings = rankGroupTeams(teams, matches)
  const { direct, playoff } = SLOT_ALLOCATION.CONMEBOL
  return {
    confederation: 'CONMEBOL',
    standings,
    qualified: standings.slice(0, direct),
    playoff: standings.slice(direct, direct + playoff),
    matches,
  }
}
