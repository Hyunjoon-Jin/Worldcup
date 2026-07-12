import { useEffect, useMemo, useState } from 'react'
import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../../data/nations'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { formatKoreanDate } from '../../data/calendar'
import { getRatings, classifyMatchUpset, forecastMatch, type MatchForecast } from '../../engine/matchEngine'
import { generateUpsetArticle, type UpsetArticle } from '../../engine/upsetArticle'
import { generateGoalTimeline, formatGoalMinute, type GoalEvent } from '../../engine/goalTimeline'
import { formatDecimalOdds } from '../../engine/odds'
import { venueForMatchId } from '../../data/venues'
import { computeStandings, rankGroupTeams } from '../../engine/tiebreakers'
import { useMatchDetailStore } from '../../store/useMatchDetailStore'
import { useSelectionStore } from '../../store/useSelectionStore'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import { FlagIcon } from './FlagIcon'
import { GlassCard } from './GlassCard'
import { UpsetBadge } from './UpsetBadge'
import type { GroupLetter } from '../../types/group'

const ROUND_LABEL_KO: Record<string, string> = {
  R32: '32강',
  R16: '16강',
  QF: '8강',
  SF: '4강',
  THIRD: '3·4위전',
  FINAL: '결승',
}

function RatingRow({ label, homeValue, awayValue }: { label: string; homeValue: number; awayValue: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-10 text-right font-bold ${homeValue > awayValue ? 'text-emerald-300' : 'text-gray-300'}`}>
        {homeValue}
      </span>
      <div className="flex-1 text-center text-gray-500">{label}</div>
      <span className={`w-10 text-left font-bold ${awayValue > homeValue ? 'text-emerald-300' : 'text-gray-300'}`}>
        {awayValue}
      </span>
    </div>
  )
}

function ForecastBar({ forecast }: { forecast: MatchForecast }) {
  return (
    <div>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-white/10"
        role="img"
        aria-label={`홈 승 ${forecast.homeWinPct.toFixed(0)}%, 무 ${forecast.drawPct.toFixed(0)}%, 원정 승 ${forecast.awayWinPct.toFixed(0)}%`}
      >
        <div className="h-full bg-sky-400" style={{ width: `${forecast.homeWinPct}%` }} />
        <div className="h-full bg-gray-500" style={{ width: `${forecast.drawPct}%` }} />
        <div className="h-full bg-rose-400" style={{ width: `${forecast.awayWinPct}%` }} />
      </div>
      {/* 색만으로 구분하지 않도록 승/무/패를 텍스트로도 표기 (E2) */}
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>홈 {forecast.homeWinPct.toFixed(0)}%</span>
        <span>무 {forecast.drawPct.toFixed(0)}%</span>
        <span>원정 {forecast.awayWinPct.toFixed(0)}%</span>
      </div>
      {/* 배당률(유럽식 소수) 병기 (v2 #29) */}
      <div className="mt-0.5 flex justify-between text-[10px] text-gray-500">
        <span>{formatDecimalOdds(forecast.homeWinPct)}</span>
        <span>{formatDecimalOdds(forecast.drawPct)}</span>
        <span>{formatDecimalOdds(forecast.awayWinPct)}</span>
      </div>
    </div>
  )
}

interface GroupStandingInfo {
  position: number
  points: number
  goalDiff: number
}

function StandingChip({ before, after }: { before?: GroupStandingInfo; after?: GroupStandingInfo }) {
  if (!after) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
      {before ? (
        <>
          {before.position}위({before.points}점)
          <span className="text-gray-600">→</span>
        </>
      ) : null}
      <span className="font-bold text-gray-200">
        {after.position}위({after.points}점, {after.goalDiff > 0 ? `+${after.goalDiff}` : after.goalDiff})
      </span>
    </span>
  )
}

function ArticleCard({ article }: { article: UpsetArticle }) {
  return (
    <div className="rounded-lg border border-red-400/30 bg-red-500/[0.06] p-3">
      <p className="mb-1.5 text-[10px] font-bold tracking-wide text-red-300/80">📰 이변 속보</p>
      <h3 className="mb-2 text-sm leading-snug font-bold text-white">{article.headline}</h3>
      <div className="space-y-1.5">
        {article.paragraphs.map((p, i) => (
          <p key={i} className="text-[11px] leading-relaxed text-gray-300">
            {p}
          </p>
        ))}
      </div>
    </div>
  )
}

/** 득점 타임라인 표시 + 재생(골을 순서대로 드러내며 스코어를 갱신) (v2 #35). */
function GoalTimelineSection({
  timeline,
  homeTeamId,
  awayTeamId,
}: {
  timeline: GoalEvent[]
  homeTeamId: string
  awayTeamId: string
}) {
  const [playing, setPlaying] = useState(false)
  const [revealed, setRevealed] = useState(timeline.length)

  useEffect(() => {
    setRevealed(timeline.length)
    setPlaying(false)
  }, [timeline])

  useEffect(() => {
    if (!playing) return
    if (revealed >= timeline.length) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setRevealed((r) => r + 1), 650)
    return () => clearTimeout(t)
  }, [playing, revealed, timeline.length])

  const shown = timeline.slice(0, revealed)
  const homeScore = shown.filter((g) => g.teamId === homeTeamId).length
  const awayScore = shown.filter((g) => g.teamId === awayTeamId).length

  return (
    <div className="mb-4 rounded-lg bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold text-gray-400">⚽ 득점 타임라인</span>
        <div className="flex items-center gap-2">
          {playing && <span className="text-[11px] font-bold tabular-nums text-white">{homeScore} - {awayScore}</span>}
          <button
            onClick={() => {
              setRevealed(0)
              setPlaying(true)
            }}
            className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-gray-200 hover:bg-white/20"
          >
            {playing ? '재생 중…' : '▶ 재생'}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {timeline.map((g, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1 text-[11px] transition-opacity ${
              i < revealed ? 'text-gray-300 opacity-100' : 'text-gray-500 opacity-30'
            }`}
          >
            <FlagIcon iso2={TEAMS_BY_ID[g.teamId].iso2} className="h-2.5 w-3.5" />
            <span className="tabular-nums">{formatGoalMinute(g)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function MatchDetailModal() {
  const selected = useMatchDetailStore((s) => s.selected)
  const clearMatch = useMatchDetailStore((s) => s.clearMatch)
  const selectTeam = useSelectionStore((s) => s.selectTeam)
  const drawGroups = useDrawStore((s) => s.state.groups)
  const allGroupMatches = useProgressStore((s) => s.groupMatches)

  const homeTeamId = selected ? (selected.kind === 'upcoming' ? selected.homeTeamId : selected.match.homeTeamId) : null
  const awayTeamId = selected ? (selected.kind === 'upcoming' ? selected.awayTeamId : selected.match.awayTeamId) : null

  const forecast = useMemo(
    () => (homeTeamId && awayTeamId ? forecastMatch(homeTeamId, awayTeamId) : null),
    [homeTeamId, awayTeamId],
  )

  const groupContext = useMemo(() => {
    if (!selected || selected.kind !== 'group') return null
    const group = selected.match.group
    const teamIds = (drawGroups[group] as (string | null)[]).filter(Boolean) as string[]
    if (teamIds.length < 4) return null
    const matchday = selected.match.matchday
    const beforeMatches = allGroupMatches.filter((m) => m.group === group && m.matchday < matchday)
    const afterMatches = allGroupMatches.filter((m) => m.group === group && m.matchday <= matchday)
    const beforeOrder = rankGroupTeams(teamIds, beforeMatches)
    const afterOrder = rankGroupTeams(teamIds, afterMatches)
    const beforeStandings = computeStandings(teamIds, beforeMatches)
    const afterStandings = computeStandings(teamIds, afterMatches)

    const infoFor = (teamId: string, order: string[], standings: ReturnType<typeof computeStandings>): GroupStandingInfo => {
      const s = standings[teamId]
      return { position: order.indexOf(teamId) + 1, points: s.points, goalDiff: s.goalsFor - s.goalsAgainst }
    }

    return {
      group,
      before: matchday > 1
        ? { home: infoFor(selected.match.homeTeamId, beforeOrder, beforeStandings), away: infoFor(selected.match.awayTeamId, beforeOrder, beforeStandings) }
        : null,
      after: { home: infoFor(selected.match.homeTeamId, afterOrder, afterStandings), away: infoFor(selected.match.awayTeamId, afterOrder, afterStandings) },
    }
  }, [selected, drawGroups, allGroupMatches])

  const knockoutContext = useMemo(() => {
    if (!selected || selected.kind !== 'knockout') return null
    const findGroupInfo = (teamId: string) => {
      const group = GROUP_LETTERS.find((g) => (drawGroups[g] as (string | null)[])?.includes(teamId))
      if (!group) return null
      const teamIds = (drawGroups[group] as (string | null)[]).filter(Boolean) as string[]
      const groupMatches = allGroupMatches.filter((m) => m.group === group)
      const order = rankGroupTeams(teamIds, groupMatches)
      const position = order.indexOf(teamId) + 1
      return { group: group as GroupLetter, position }
    }
    return {
      home: findGroupInfo(selected.match.homeTeamId),
      away: findGroupInfo(selected.match.awayTeamId),
    }
  }, [selected, drawGroups, allGroupMatches])

  if (!selected || !homeTeamId || !awayTeamId || !forecast) return null

  const homeTeam = TEAMS_BY_ID[homeTeamId]
  const awayTeam = TEAMS_BY_ID[awayTeamId]
  const homeRatings = getRatings(homeTeamId)
  const awayRatings = getRatings(awayTeamId)

  const played = selected.kind !== 'upcoming'
  const homeGoals = selected.kind !== 'upcoming' ? selected.match.homeGoals : undefined
  const awayGoals = selected.kind !== 'upcoming' ? selected.match.awayGoals : undefined

  const venueKey =
    selected.kind === 'knockout'
      ? selected.match.slotId
      : selected.kind === 'group'
        ? `${selected.match.group}-${selected.match.matchday}-${homeTeamId}-${awayTeamId}`
        : `${homeTeamId}-${awayTeamId}`
  const venue = venueForMatchId(venueKey)

  const goalTimeline =
    played && (homeGoals! > 0 || awayGoals! > 0)
      ? generateGoalTimeline(homeTeamId, awayTeamId, homeGoals!, awayGoals!)
      : []
  const upsetInfo = played ? classifyMatchUpset(homeTeamId, awayTeamId, homeGoals!, awayGoals!) : null
  const wentToPenalties = selected.kind === 'knockout' ? selected.match.wentToPenalties : false
  const winnerTeamId = selected.kind === 'knockout' ? selected.match.winnerTeamId : upsetInfo?.winnerTeamId

  const label =
    selected.kind === 'group'
      ? `조별리그 MD${selected.match.matchday} · 조 ${selected.match.group}`
      : selected.kind === 'knockout'
        ? ROUND_LABEL_KO[selected.match.round]
        : selected.label

  const favoredTeamId =
    homeRatings.overall === awayRatings.overall ? null : homeRatings.overall > awayRatings.overall ? homeTeamId : awayTeamId

  const article: UpsetArticle | null =
    played && upsetInfo && (upsetInfo.upset || upsetInfo.surpriseDraw)
      ? (() => {
          const isDraw = !upsetInfo.upset && upsetInfo.surpriseDraw
          const articleWinnerId = isDraw
            ? homeRatings.overall <= awayRatings.overall
              ? homeTeamId
              : awayTeamId
            : upsetInfo.winnerTeamId!
          const articleLoserId = articleWinnerId === homeTeamId ? awayTeamId : homeTeamId
          const winnerGoals = articleWinnerId === homeTeamId ? homeGoals! : awayGoals!
          const loserGoals = articleWinnerId === homeTeamId ? awayGoals! : homeGoals!
          const underdogForecastPct = articleWinnerId === homeTeamId ? forecast.homeWinPct : forecast.awayWinPct
          return generateUpsetArticle({
            winnerTeamId: articleWinnerId,
            loserTeamId: articleLoserId,
            winnerGoals,
            loserGoals,
            isDraw,
            wentToPenalties: !!wentToPenalties,
            underdogForecastPct,
            roundLabel: label,
          })
        })()
      : null

  const goToTeam = (teamId: string) => {
    clearMatch()
    selectTeam(teamId)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={clearMatch}
    >
      <GlassCard
        strong
        className="max-h-[88vh] w-full max-w-md overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400">{label}</span>
          <button type="button" onClick={clearMatch} className="text-gray-400 hover:text-white" aria-label="닫기">
            ✕
          </button>
        </div>

        {selected.date && (
          <p className="text-center text-[11px] text-gray-500">
            {formatKoreanDate(selected.date)}
            {selected.timeSlot ? ` ${selected.timeSlot}` : ''} 현지시간
          </p>
        )}
        <p className="mb-3 text-center text-[11px] text-gray-500">
          📍 {venue.cityKo} · {venue.stadium}
        </p>

        <div className="mb-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => goToTeam(homeTeamId)}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center hover:opacity-80"
          >
            <FlagIcon iso2={homeTeam.iso2} className="h-8 w-12" />
            <span className="text-sm font-semibold text-white">{homeTeam.nameKo}</span>
            <span className="text-[10px] text-gray-500">FIFA {homeTeam.fifaRankApprox}위</span>
          </button>
          <div className="shrink-0 text-center">
            {played ? (
              <div className="rounded-lg bg-white/10 px-3 py-1.5 text-2xl font-bold text-white">
                {homeGoals} - {awayGoals}
              </div>
            ) : (
              <div className="text-lg font-bold text-gray-500">VS</div>
            )}
            {wentToPenalties && <div className="mt-1 text-[10px] text-gray-400">승부차기</div>}
          </div>
          <button
            type="button"
            onClick={() => goToTeam(awayTeamId)}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center hover:opacity-80"
          >
            <FlagIcon iso2={awayTeam.iso2} className="h-8 w-12" />
            <span className="text-sm font-semibold text-white">{awayTeam.nameKo}</span>
            <span className="text-[10px] text-gray-500">FIFA {awayTeam.fifaRankApprox}위</span>
          </button>
        </div>

        {!played && <p className="mb-4 text-center text-xs text-gray-400">아직 진행되지 않은 경기입니다.</p>}

        {played && upsetInfo && (upsetInfo.upset || upsetInfo.surpriseDraw) && (
          <div className="mb-4 flex justify-center">
            <UpsetBadge upset={upsetInfo.upset} surpriseDraw={upsetInfo.surpriseDraw} />
          </div>
        )}

        {played && winnerTeamId && (
          <p className="mb-4 text-center text-xs text-emerald-300">
            {TEAMS_BY_ID[winnerTeamId].nameKo} 승리{wentToPenalties ? ' (승부차기)' : ''}
          </p>
        )}

        {goalTimeline.length > 0 && (
          <GoalTimelineSection timeline={goalTimeline} homeTeamId={homeTeamId} awayTeamId={awayTeamId} />
        )}

        {article && (
          <div className="mb-4">
            <ArticleCard article={article} />
          </div>
        )}

        {groupContext && (
          <div className="mb-4 rounded-lg bg-white/5 p-3">
            <p className="mb-2 text-center text-[11px] font-bold text-gray-400">조 {groupContext.group} 순위 변동</p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-1 flex-col items-center gap-0.5">
                <span className="text-[11px] text-gray-300">{homeTeam.nameKo}</span>
                <StandingChip before={groupContext.before?.home} after={groupContext.after.home} />
              </div>
              <div className="flex flex-1 flex-col items-center gap-0.5">
                <span className="text-[11px] text-gray-300">{awayTeam.nameKo}</span>
                <StandingChip before={groupContext.before?.away} after={groupContext.after.away} />
              </div>
            </div>
          </div>
        )}

        {knockoutContext && (knockoutContext.home || knockoutContext.away) && (
          <div className="mb-4 rounded-lg bg-white/5 p-3">
            <p className="mb-2 text-center text-[11px] font-bold text-gray-400">조별리그 성적</p>
            <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
              <span className="flex-1 text-center">
                {knockoutContext.home ? `조 ${knockoutContext.home.group} ${knockoutContext.home.position}위로 진출` : '진출 정보 없음'}
              </span>
              <span className="flex-1 text-center">
                {knockoutContext.away ? `조 ${knockoutContext.away.group} ${knockoutContext.away.position}위로 진출` : '진출 정보 없음'}
              </span>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-white/5 p-3">
          <p className="mb-2 text-center text-[11px] font-bold text-gray-400">
            {played ? '경기 전 예상' : '예상 승부'}
          </p>
          <ForecastBar forecast={forecast} />
          <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
            <RatingRow label="공격" homeValue={homeRatings.attack} awayValue={awayRatings.attack} />
            <RatingRow label="수비" homeValue={homeRatings.defense} awayValue={awayRatings.defense} />
            <RatingRow label="컨디션" homeValue={homeRatings.form} awayValue={awayRatings.form} />
            <RatingRow label="종합" homeValue={homeRatings.overall} awayValue={awayRatings.overall} />
          </div>
          {favoredTeamId && (
            <p className="mt-2 text-center text-[10px] text-gray-500">
              {TEAMS_BY_ID[favoredTeamId].nameKo} 쪽이 전력상 {played ? '우세했습니다.' : '우세합니다.'}
            </p>
          )}
        </div>
      </GlassCard>
    </div>
  )
}
