import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../data/nations'
import type { StatMatch, TournamentStats } from './tournamentStats'
import type { Highlight } from './highlights'

export interface AchievementContext {
  stats: TournamentStats
  highlights: Highlight[]
  matches: StatMatch[]
  champion: string | null
  myTeamId: string | null
  /** 우승팀의 확정 경기 승/무/패 목록(무패 판정용) */
  championResults: ('win' | 'draw' | 'loss')[]
}

export interface Achievement {
  id: string
  icon: string
  title: string
  desc: string
  earned: boolean
}

/** 대회 상태로부터 업적 목록을 판정한다 (v2 #46). 순수 함수라 테스트 가능. */
export function evaluateAchievements(ctx: AchievementContext): Achievement[] {
  const upsetCount = ctx.highlights.filter((h) => h.type === 'upset').length
  const routCount = ctx.highlights.filter((h) => h.type === 'rout').length
  const championRank = ctx.champion ? TEAMS_BY_ID[ctx.champion]?.fifaRankApprox ?? 99 : 99
  const championUnbeaten =
    ctx.champion != null && ctx.championResults.length > 0 && ctx.championResults.every((r) => r !== 'loss')
  const bestCleanSheets = ctx.stats.bestDefense[0]?.cleanSheets ?? 0
  const topScorerGoals = ctx.stats.topScorers[0]?.goals ?? 0

  const defs: Achievement[] = []
  const add = (id: string, icon: string, title: string, desc: string, earned: boolean) =>
    defs.push({ id, icon, title, desc, earned })

  add('witness', '⚡', '이변 목격자', '한 대회에서 이변 3회 이상 관측', upsetCount >= 3)
  add('goal-fest', '💥', '골 폭죽', '3골 차 이상 대승 2회 이상', routCount >= 2)
  add('shootout-drama', '🎯', '승부차기 드라마', '승부차기 3회 이상', ctx.stats.penaltyShootouts >= 3)
  add('wall', '🛡', '철벽 수비', '한 팀이 무실점 3경기 이상', bestCleanSheets >= 3)
  add('sharpshooter', '⚽', '득점 기계', '한 팀이 통산 8골 이상', topScorerGoals >= 8)
  add('unbeaten', '🏅', '무패 우승', '우승팀이 한 경기도 지지 않고 우승', championUnbeaten)
  add('underdog', '🐎', '언더독의 반란', 'FIFA 랭킹 20위 밖 팀이 우승', ctx.champion != null && championRank > 20)
  add('my-glory', '⭐', '내 팀의 영광', '내 팀이 우승', ctx.myTeamId != null && ctx.myTeamId === ctx.champion)

  return defs
}
