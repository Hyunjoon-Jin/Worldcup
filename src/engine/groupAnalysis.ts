import { getRatings } from './matchEngine'
import type { GroupLetter } from '../types/group'

export type GroupDifficultyTier = 'death' | 'tough' | 'normal' | 'easy'

export interface GroupDifficulty {
  group: GroupLetter
  avgOverall: number
  tier: GroupDifficultyTier
}

/**
 * 조별 평균 종합 능력치(샌드박스 조정치 반영)를 기준으로 조의 난이도를 분석한다.
 * 상위 3개 조 = 죽음의 조, 하위 3개 조 = 꿀조로 표시한다.
 */
export function analyzeGroupDifficulty(groupTeams: Record<GroupLetter, string[]>): GroupDifficulty[] {
  const entries = (Object.entries(groupTeams) as [GroupLetter, string[]][])
    .filter(([, teamIds]) => teamIds.length === 4)
    .map(([group, teamIds]) => {
      const avgOverall = teamIds.reduce((sum, id) => sum + getRatings(id).overall, 0) / teamIds.length
      return { group, avgOverall }
    })
    .sort((a, b) => b.avgOverall - a.avgOverall)

  return entries.map((e, idx) => {
    let tier: GroupDifficultyTier = 'normal'
    if (idx < 3) tier = 'death'
    else if (idx >= entries.length - 3) tier = 'easy'
    return { ...e, tier }
  })
}
