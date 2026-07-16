import { useMemo } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { useContinentalStore } from '../../store/useContinentalStore'
import { useContinentalHistoryStore, aggregateCupHonors } from '../../store/useContinentalHistoryStore'
import { CUP_FORMATS, type CupId } from '../../data/continental/formats'
import type { KnockoutRound } from '../../types/match'

const ROUND_LABEL: Record<KnockoutRound, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위전', FINAL: '결승' }

/**
 * 팀 상세 페이지의 '대륙컵 현황' — 활성 대륙컵에 이 팀이 참가 중이면 조 순위·경기·녹아웃 경로·성적·우승 확률을
 * 월드컵 지역예선 섹션과 동일 층위로 보여준다(요구: 팀 정보 전 영역 월드컵 동일 층위).
 */
export function TeamContinentalSection({ teamId }: { teamId: string }) {
  const activeCupId = useContinentalStore((s) => s.activeCupId)
  const result = useContinentalStore((s) => s.result)
  const probabilities = useContinentalStore((s) => s.probabilities)
  const editions = useContinentalHistoryStore((s) => s.editions)

  // 대륙컵 통산 성적(역대 기록 아카이브).
  const honors = useMemo(() => aggregateCupHonors(editions, teamId), [editions, teamId])
  const honorRows = useMemo(
    () => (Object.entries(honors.byCup) as Array<[CupId, { titles: number; runnerUp: number; third: number; appearances: number }]>)
      .filter(([, h]) => h.appearances > 0)
      .sort((a, b) => b[1].titles - a[1].titles || b[1].appearances - a[1].appearances),
    [honors],
  )

  const view = useMemo(() => {
    if (!activeCupId || !result) return null
    const format = CUP_FORMATS[activeCupId]
    const group = result.groups.find((g) => g.teams.includes(teamId))
    if (!group) return null // 이 팀은 이 대회 참가국 아님
    const rankInGroup = group.ranking.indexOf(teamId) + 1
    const standing = group.standings[teamId]
    const advanced = result.qualified.includes(teamId)
    const groupMatches = group.matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    const koMatches = result.knockout.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)

    // 최종 성적
    let outcome: string
    if (result.champion === teamId) outcome = '🏆 우승'
    else if (result.runnerUp === teamId) outcome = '🥈 준우승'
    else if (result.third === teamId) outcome = '🥉 3위'
    else if (!advanced) outcome = '조별리그 탈락'
    else {
      const lost = koMatches.find((m) => m.result.winnerTeamId !== teamId)
      outcome = lost ? `${ROUND_LABEL[lost.round]} 탈락` : '녹아웃 진출'
    }
    return { format, group, rankInGroup, standing, advanced, groupMatches, koMatches, outcome }
  }, [activeCupId, result, teamId])

  // 활성 참가도 없고 통산 기록도 없으면 표시 안 함.
  if (!view && honorRows.length === 0) return null

  const champPct = view ? probabilities?.byTeam[teamId]?.champion : undefined
  const gd = view ? view.standing.goalsFor - view.standing.goalsAgainst : 0

  const honorsBlock = honorRows.length > 0 && (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] font-bold text-gray-400">대륙컵 통산 {honors.totalTitles > 0 && <span className="text-amber-300">🏆 {honors.totalTitles}회 우승</span>}</p>
      <div className="flex flex-wrap gap-1.5">
        {honorRows.map(([cupId, h]) => (
          <span key={cupId} className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-gray-300">
            {CUP_FORMATS[cupId].nameKo}
            {h.titles > 0 && <span className="ml-1 font-bold text-amber-300">🏆{h.titles}</span>}
            {h.runnerUp > 0 && <span className="ml-1 text-gray-400">🥈{h.runnerUp}</span>}
            <span className="ml-1 text-gray-500">· {h.appearances}회 진출</span>
          </span>
        ))}
      </div>
    </div>
  )

  if (!view) {
    return (
      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-bold text-violet-300">🌍 대륙컵 통산</h3>
        {honorsBlock}
      </GlassCard>
    )
  }

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-violet-300">🌍 {view.format.nameKo} 현황</h3>
        <span className="rounded bg-violet-500/20 px-2 py-0.5 text-[11px] font-bold text-violet-200">{view.outcome}</span>
      </div>
      {honorsBlock}

      <div className="mb-3 rounded-lg bg-white/5 p-3 text-sm text-gray-200">
        현재 <strong className="text-white">{view.group.groupIndex + 1}조 {view.rankInGroup}위</strong>
        <span className="ml-1 text-gray-400">· {view.standing.win}승 {view.standing.draw}무 {view.standing.loss}패 · 득실 {gd > 0 ? `+${gd}` : gd} · 승점 {view.standing.points}</span>
        {view.advanced && <span className="ml-1 text-emerald-300">· 녹아웃 진출</span>}
        {champPct != null && <span className="ml-1 text-amber-300">· 우승 확률 {champPct.toFixed(1)}%</span>}
      </div>

      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-bold text-gray-400">조별리그 경기</p>
        <div className="space-y-1">
          {view.groupMatches.map((m, i) => {
            const isHome = m.homeTeamId === teamId
            const oppId = isHome ? m.awayTeamId : m.homeTeamId
            const gf = isHome ? m.homeGoals : m.awayGoals
            const ga = isHome ? m.awayGoals : m.homeGoals
            const res = gf > ga ? '승' : gf < ga ? '패' : '무'
            return (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">
                <span className={`w-5 text-center font-bold ${res === '승' ? 'text-emerald-300' : res === '패' ? 'text-red-300' : 'text-gray-400'}`}>{res}</span>
                <span className="min-w-0 flex-1">{isHome ? '' : '@'}<TeamLink teamId={oppId} /></span>
                <span className="font-mono text-gray-300">{gf}-{ga}</span>
              </div>
            )
          })}
        </div>
      </div>

      {view.koMatches.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold text-gray-400">녹아웃 경기</p>
          <div className="space-y-1">
            {view.koMatches.map((m, i) => {
              const isHome = m.homeTeamId === teamId
              const oppId = isHome ? m.awayTeamId : m.homeTeamId
              const gf = isHome ? m.result.homeGoals : m.result.awayGoals
              const ga = isHome ? m.result.awayGoals : m.result.homeGoals
              const won = m.result.winnerTeamId === teamId
              const pk = m.result.wentToPenalties ? ` (PK ${isHome ? m.result.homePenalties : m.result.awayPenalties}-${isHome ? m.result.awayPenalties : m.result.homePenalties})` : ''
              return (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">
                  <span className="w-10 shrink-0 text-[10px] font-bold text-violet-200">{ROUND_LABEL[m.round]}</span>
                  <span className={`w-5 text-center font-bold ${won ? 'text-emerald-300' : 'text-red-300'}`}>{won ? '승' : '패'}</span>
                  <span className="min-w-0 flex-1">{isHome ? '' : '@'}<TeamLink teamId={oppId} /></span>
                  <span className="font-mono text-gray-300">{gf}-{ga}{pk}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </GlassCard>
  )
}
