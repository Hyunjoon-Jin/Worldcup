import { describe, expect, it } from 'vitest'
import { computeStandings, rankGroupTeams, rankThirdPlaceTeams } from '../src/engine/tiebreakers'
import type { GroupMatch } from '../src/types/match'

function gm(homeTeamId: string, awayTeamId: string, homeGoals: number, awayGoals: number, group = 'A'): GroupMatch {
  return { group: group as GroupMatch['group'], matchday: 1, homeTeamId, awayTeamId, homeGoals, awayGoals }
}

describe('computeStandings', () => {
  it('승/무/패·득실·승점을 정확히 집계한다', () => {
    const matches = [gm('ARG', 'BRA', 2, 1), gm('ARG', 'KOR', 0, 0)]
    const table = computeStandings(['ARG', 'BRA', 'KOR'], matches)
    expect(table.ARG).toMatchObject({ played: 2, win: 1, draw: 1, loss: 0, goalsFor: 2, goalsAgainst: 1, points: 4 })
    expect(table.BRA).toMatchObject({ played: 1, win: 0, draw: 0, loss: 1, points: 0 })
    expect(table.KOR).toMatchObject({ played: 1, draw: 1, points: 1 })
  })
})

describe('rankGroupTeams — 2026 상호전적 우선 규칙', () => {
  it('동률 시 상호전적이 조 전체 골득실보다 우선한다', () => {
    // ARG·BRA 모두 6점: BRA의 전체 골득실(+5)이 ARG(+2)보다 좋지만, 맞대결에서 ARG가 이겼으므로 ARG가 위.
    // KOR·GHA 모두 3점: KOR의 전체 골득실(-1)이 GHA(-6)보다 좋지만, 맞대결에서 GHA가 이겼으므로 GHA가 위.
    const matches = [
      gm('ARG', 'BRA', 1, 0),
      gm('ARG', 'KOR', 0, 2),
      gm('ARG', 'GHA', 3, 0),
      gm('BRA', 'KOR', 2, 0),
      gm('BRA', 'GHA', 4, 0),
      gm('KOR', 'GHA', 0, 1),
    ]
    expect(rankGroupTeams(['ARG', 'BRA', 'KOR', 'GHA'], matches)).toEqual(['ARG', 'BRA', 'GHA', 'KOR'])
  })

  it('승점이 모두 다르면 승점 내림차순으로 정렬한다', () => {
    const matches = [
      gm('ARG', 'BRA', 3, 0),
      gm('ARG', 'KOR', 1, 0),
      gm('BRA', 'KOR', 0, 0),
    ]
    // ARG 6, BRA 1, KOR 1 → ARG 먼저. BRA/KOR는 맞대결 무승부라 전체 기록으로 비교(둘 다 1점)
    const ranked = rankGroupTeams(['ARG', 'BRA', 'KOR'], matches)
    expect(ranked[0]).toBe('ARG')
  })
})

describe('rankThirdPlaceTeams — 12개 조 3위 중 상위 8팀 진출', () => {
  it('상위 8팀만 qualified=true로 표시한다', () => {
    // 9개 조의 3위팀에게 서로 다른 승점을 부여해 명확히 서열화
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const
    const ids = ['ARG', 'BRA', 'FRA', 'ESP', 'ENG', 'POR', 'NED', 'GER', 'CRO']
    const thirdByGroup: Record<string, string> = {}
    const matches: GroupMatch[] = []
    ids.forEach((id, i) => {
      const group = groups[i]
      thirdByGroup[group] = id
      // 승점을 i에 따라 차등: 이긴 경기 수를 다르게 (더미 상대와의 경기)
      const wins = 9 - i // A조 3위는 9골 차 승리들… 서열 명확화용
      matches.push(gm(id, `DUM${i}`, wins, 0, group))
    })
    const result = rankThirdPlaceTeams(thirdByGroup, matches)
    expect(result).toHaveLength(9)
    expect(result.filter((r) => r.qualified)).toHaveLength(8)
    // 가장 성적 나쁜(마지막 index) 팀이 탈락
    expect(result[result.length - 1].qualified).toBe(false)
    expect(result[0].qualified).toBe(true)
  })
})
