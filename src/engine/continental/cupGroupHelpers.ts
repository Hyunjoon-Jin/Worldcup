import { GROUP_LETTERS } from '../../data/hostSlots'
import { rankGroupTeams, rankThirdPlaceTeams } from '../tiebreakers'
import type { CupFormat } from '../../data/continental/formats'
import type { CupGroupResult, CupResult } from './runCup'
import type { QualificationStatus } from '../qualificationStatus'
import type { GroupLetter } from '../../types/group'
import type { GroupMatch } from '../../types/match'

/** 대륙컵 조 인덱스 → 월드컵 조 문자(A·B·…). */
export const letterOf = (groupIndex: number): GroupLetter => GROUP_LETTERS[groupIndex] as GroupLetter

/** 대륙컵 조별 경기(공개분)를 월드컵 GroupTable/ThirdPlaceTable이 받는 GroupMatch로 변환. */
export function toGroupMatches(groups: CupGroupResult[], revealedMd: number): GroupMatch[] {
  const out: GroupMatch[] = []
  for (const g of groups) {
    for (const m of g.matches) {
      if (m.matchday > revealedMd) continue
      out.push({
        group: letterOf(g.groupIndex),
        matchday: m.matchday as 1 | 2 | 3,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
      })
    }
  }
  return out
}

/**
 * 대륙컵 진출확정/탈락확정 판정 — 조별리그가 모두 공개된 뒤(revealedMd>=3) 확정만 계산한다.
 * 각 조 상위 advancePerGroup은 진출확정, best-thirds가 있으면 3위 팀들을 횡단 비교해 상위 bestThirds도
 * 진출확정, 나머지는 탈락확정. 진행 중이면 전부 미확정(배지 없음).
 */
export function computeCupStatuses(result: CupResult, format: CupFormat, revealedMd: number): Record<string, QualificationStatus> {
  if (revealedMd < 3) return {}
  const status: Record<string, QualificationStatus> = {}
  const thirdByGroup: Partial<Record<GroupLetter, string>> = {}
  for (const g of result.groups) {
    const order = rankGroupTeams(g.teams, g.matches, format.groupTiebreak)
    order.forEach((id, i) => {
      if (i < format.advancePerGroup) status[id] = 'advancing'
      else status[id] = 'eliminated'
    })
    if (format.bestThirds > 0 && order[format.advancePerGroup]) thirdByGroup[letterOf(g.groupIndex)] = order[format.advancePerGroup]
  }
  if (format.bestThirds > 0) {
    const gm = toGroupMatches(result.groups, revealedMd)
    const ranked = rankThirdPlaceTeams(thirdByGroup, gm, format.bestThirds)
    for (const e of ranked) status[e.teamId] = e.qualified ? 'advancing' : 'eliminated'
  }
  return status
}
