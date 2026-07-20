import { useMemo } from 'react'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useContinentalStore } from '../../store/useContinentalStore'
import { useCareerStore } from '../../store/useCareerStore'
import { useCrisisTeams } from '../../store/useCrisisTeams'
import { useLiveFifaRanking } from '../ranking/useLiveFifaRanking'
import { flattenPlayed, collectPlayedByConfed } from '../../engine/qualification/conditional'
import { cupToRankingResults } from '../../engine/continental/runCup'
import { CUP_FORMATS } from '../../data/continental/formats'
import { generateSeasonNews, type NewsItem, type NewsMatch } from '../../engine/news/seasonNews'
import type { KnockoutMatch } from '../../types/match'

/**
 * 시즌 뉴스 단일 출처(D). 진행 스토어들(예선·본선·대륙컵·라이브 랭킹·위기)에서 신호를 모아
 * generateSeasonNews로 헤드라인을 만든다. 여러 화면(시즌 홈 등)이 이 훅으로 동일한 뉴스를 본다.
 */
export function useSeasonNews(limit = 8): NewsItem[] {
  const result = useQualificationStore((s) => s.result)
  const revealed = useQualificationStore((s) => s.revealed)
  const friendlies = useQualificationStore((s) => s.friendlies)
  const groupMatches = useProgressStore((s) => s.groupMatches)
  const knockoutSlots = useProgressStore((s) => s.knockoutSlots)
  const wcChampion = useProgressStore((s) => s.champion)
  const wcYear = useCareerStore((s) => s.year)
  const cupResult = useContinentalStore((s) => s.result)
  const cupYear = useContinentalStore((s) => s.cupYear)
  const { rows: liveRanking } = useLiveFifaRanking()
  const crisisMap = useCrisisTeams()

  return useMemo(() => {
    // 이미 치른(공개된) 경기를 시간순으로 모은다: 예선 → 친선 → 본선 조별 → 본선 녹아웃 → 대륙컵.
    const played: NewsMatch[] = []
    if (result) {
      for (const m of flattenPlayed(collectPlayedByConfed(result, revealed))) {
        played.push({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals })
      }
      const globalRevealed = Math.max(0, ...Object.values(revealed))
      for (const f of friendlies) {
        if (f.matchday <= globalRevealed) played.push({ homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeGoals: f.homeGoals, awayGoals: f.awayGoals })
      }
    }
    for (const m of groupMatches) played.push({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals })
    const koMatches = Object.values(knockoutSlots)
      .map((s) => s.result)
      .filter((m): m is KnockoutMatch => m != null)
    for (const m of koMatches) played.push({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals, wentToPenalties: m.wentToPenalties })
    if (cupResult) {
      const cr = cupToRankingResults(cupResult)
      for (const m of cr.groupMatches) played.push(m)
      for (const m of cr.knockoutMatches) played.push({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals, wentToPenalties: m.wentToPenalties })
    }

    // 예선이 완전히 끝났는지(모든 대륙 공개 완료) — 진출/탈락 드라마 스포일러 방지.
    const qualComplete = !!result && Object.entries(result.byConfederation).every(([c, r]) => (revealed[c] ?? 0) >= r.matchdays)

    const continentalChampion = cupResult
      ? { teamId: cupResult.champion, cupNameKo: CUP_FORMATS[cupResult.cupId].nameKo, year: cupYear ?? undefined }
      : null

    const crisisTeams = Object.entries(crisisMap).map(([teamId, info]) => ({ teamId, pct: info.pct }))

    return generateSeasonNews(
      {
        wcChampion,
        wcYear,
        continentalChampion,
        qualResult: result,
        qualComplete,
        playedMatches: played,
        liveRanking,
        crisisTeams,
      },
      limit,
    )
  }, [result, revealed, friendlies, groupMatches, knockoutSlots, wcChampion, wcYear, cupResult, cupYear, liveRanking, crisisMap, limit])
}
