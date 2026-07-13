import { getRatings } from './matchEngine'
import type { GroupLetter } from '../types/group'

export type GroupDifficultyTier = 'death' | 'tough' | 'normal' | 'easy'

export interface GroupDifficulty {
  group: GroupLetter
  avgOverall: number
  tier: GroupDifficultyTier
  /** 조 난이도 별점 1(가장 쉬움)~5(가장 어려움) (D7) */
  stars: number
}

/**
 * 조별 평균 종합 능력치(샌드박스 조정치 반영)를 기준으로 조의 난이도를 분석한다.
 * 상위 3개 조 = 죽음의 조, 하위 3개 조 = 꿀조로 표시하고, 평균 능력치를 최소~최대 구간에
 * 정규화해 1~5 별점을 매긴다.
 */
export function analyzeGroupDifficulty(groupTeams: Record<GroupLetter, string[]>): GroupDifficulty[] {
  const entries = (Object.entries(groupTeams) as [GroupLetter, string[]][])
    .filter(([, teamIds]) => teamIds.length === 4)
    .map(([group, teamIds]) => {
      const avgOverall = teamIds.reduce((sum, id) => sum + getRatings(id).overall, 0) / teamIds.length
      return { group, avgOverall }
    })
    .sort((a, b) => b.avgOverall - a.avgOverall)

  const avgs = entries.map((e) => e.avgOverall)
  const min = Math.min(...avgs)
  const max = Math.max(...avgs)
  const range = max - min || 1

  return entries.map((e, idx) => {
    let tier: GroupDifficultyTier = 'normal'
    if (idx < 3) tier = 'death'
    else if (idx >= entries.length - 3) tier = 'easy'
    const stars = 1 + Math.round((4 * (e.avgOverall - min)) / range)
    return { ...e, tier, stars }
  })
}
