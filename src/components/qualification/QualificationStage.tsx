import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { FlagIcon } from '../common/FlagIcon'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { useSelectionStore } from '../../store/useSelectionStore'
import { useSoundStore } from '../../store/useSoundStore'
import { playVictory } from '../../engine/sound'
import { prepareFinalsDrawFromQualification, advanceToNextEdition } from '../../store/tournamentActions'
import { useCareerStore } from '../../store/useCareerStore'
import { useProgressStore } from '../../store/useProgressStore'
import { computeStandings, rankGroupTeams } from '../../engine/tiebreakers'
import { rankAcrossGroups } from '../../engine/qualification/generic'
import { extractQualDrama } from '../../engine/qualification/drama'
import { computeQualStats, computeConfedDifficulty, computeLuckAnalysis, probMarginPct, computeQualHighlights, type QualTeamStat } from '../../engine/qualification/stats'
import { pickQualUpset } from '../../engine/qualification/upset'
import { runWhatIfScenarios, type WhatIfScenario } from '../../engine/qualification/whatif'
import { buildQualCalendar } from '../../engine/qualification/calendar'
import { QUAL_RULES, INTER_CONFED_RULE, deriveQualStages, stageStatus, stageNameAt } from '../../engine/qualification/rules'
import { computeLiveRanking, computeRankingTrend, formOffsetsFromResults, editionEndRankingPoints, type LiveRankRow, type TeamTrend } from '../../engine/qualification/ranking'
import { collectPlayedByConfed, flattenPlayed, isPartialProgress } from '../../engine/qualification/conditional'
import { generateUpsetArticle } from '../../engine/upsetArticle'
import { PROB_ITERATIONS } from '../../store/useQualificationStore'
import type { AllQualificationResult } from '../../engine/qualification'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { CONFEDERATION_LABEL_KO } from '../../data/teams'
import { computePots } from '../../engine/drawEngine'
import { getCurrentHostIds } from '../../engine/hostContext'
import { QualMatchModal } from './QualMatchModal'
import type { Confederation } from '../../types/team'
import type { MatchResult } from '../../types/match'
import type { QualificationResult } from '../../types/qualification'
import type { InterConfedResult } from '../../engine/qualification/interConfed'

/** 한 조의 경기 목록(접이식). 클릭 시 상세 모달을 연다 (F1). */
function MatchList({
  teams,
  matches,
  onSelectMatch,
}: {
  teams: string[]
  matches: MatchResult[]
  onSelectMatch: (m: MatchResult) => void
}) {
  const teamSet = new Set(teams)
  const groupMatches = matches.filter((m) => teamSet.has(m.homeTeamId) && teamSet.has(m.awayTeamId))
  if (groupMatches.length === 0) return null
  return (
    <details className="group mt-1.5">
      <summary className="cursor-pointer list-none text-[11px] text-gray-500 hover:text-gray-300">
        ⚽ 경기 결과 {groupMatches.length}경기 ▾
      </summary>
      <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {groupMatches.map((m, i) => (
          <button
            key={i}
            onClick={() => onSelectMatch(m)}
            className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1 text-[11px] hover:bg-white/10"
          >
            <span className="min-w-0 flex-1 truncate text-right text-gray-300">
              {ALL_NATIONS_BY_ID[m.homeTeamId]?.nameKo ?? m.homeTeamId}
            </span>
            <span className="shrink-0 font-bold tabular-nums text-white">
              {m.homeGoals}-{m.awayGoals}
            </span>
            <span className="min-w-0 flex-1 truncate text-gray-300">
              {ALL_NATIONS_BY_ID[m.awayTeamId]?.nameKo ?? m.awayTeamId}
            </span>
          </button>
        ))}
      </div>
    </details>
  )
}

const CONFEDS: Confederation[] = ['UEFA', 'CAF', 'AFC', 'CONMEBOL', 'CONCACAF', 'OFC']

/** 국가 라벨. 기본은 클릭 시 국가 상세 페이지로 이동(interactive). 버튼 안에 들어가는 자리에서는
 *  interactive={false}로 정적 라벨로 쓴다(버튼 중첩 방지). */
function NationLabel({
  teamId,
  className = '',
  interactive = true,
}: {
  teamId: string
  className?: string
  interactive?: boolean
}) {
  const nation = ALL_NATIONS_BY_ID[teamId]
  const selectTeam = useSelectionStore((s) => s.selectTeam)
  if (!nation) return <span className="text-gray-100">{teamId}</span>
  const inner = (
    <>
      <FlagIcon iso2={nation.iso2} className="h-3 w-4 shrink-0" />
      <span className="font-medium text-gray-100">{nation.nameKo}</span>
    </>
  )
  if (!interactive) {
    return <span className={`inline-flex items-center gap-1.5 ${className}`}>{inner}</span>
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        selectTeam(teamId)
      }}
      title={`${nation.nameKo} 상세 보기`}
      className={`inline-flex min-w-0 items-center gap-1.5 text-left hover:underline hover:decoration-emerald-300/60 hover:underline-offset-2 ${className}`}
    >
      {inner}
    </button>
  )
}

/** 예선 통계 리더보드 (F5). 다득점·최소실점·최다승·최다 점수차 경기. */
function QualStatsCard({ result }: { result: AllQualificationResult }) {
  const stats = useMemo(() => computeQualStats(result), [result])

  function Leader({ title, rows, metric, unit }: { title: string; rows: QualTeamStat[]; metric: (s: QualTeamStat) => number; unit: string }) {
    return (
      <div>
        <p className="mb-1.5 text-[11px] font-bold text-emerald-300">{title}</p>
        <ol className="space-y-1">
          {rows.map((s, i) => (
            <li key={s.teamId} className="flex items-center gap-2 text-xs">
              <span className="w-3 shrink-0 text-center text-[10px] text-gray-500 tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1"><NationLabel teamId={s.teamId} /></span>
              <span className="shrink-0 font-bold tabular-nums text-white">
                {metric(s)}
                <span className="ml-0.5 text-[9px] font-normal text-gray-500">{unit}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  const bw = stats.biggestWin
  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-sm font-bold text-sky-300">📊 예선 통계</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Leader title="🎯 다득점" rows={stats.topScorers} metric={(s) => s.goalsFor} unit="골" />
        <Leader title="🛡️ 최소 실점" rows={stats.bestDefense} metric={(s) => s.goalsAgainst} unit="실점" />
        <Leader title="🏅 최다 승" rows={stats.mostWins} metric={(s) => s.wins} unit="승" />
      </div>
      {bw && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-xs text-gray-300">
          <span className="text-[11px] font-bold text-amber-300">💥 최다 점수차</span>
          <NationLabel teamId={bw.match.homeTeamId} />
          <span className="font-bold tabular-nums text-white">{bw.match.homeGoals}-{bw.match.awayGoals}</span>
          <NationLabel teamId={bw.match.awayTeamId} />
          <span className="text-[10px] text-gray-500">({bw.margin}점차)</span>
        </div>
      )}
    </GlassCard>
  )
}

const TREND_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#22d3ee']

/** FIFA 점수 변동 추이 SVG 라인 차트. 진행된 경기일에 따라 팀별 점수 변화를 그린다. */
function RankingTrendChart({ trend }: { trend: TeamTrend[] }) {
  const W = 340
  const H = 150
  const padL = 6
  const padR = 6
  const padT = 10
  const padB = 8
  const n = trend[0]?.series.length ?? 0
  const allPts = trend.flatMap((t) => t.series.map((s) => s.points))
  if (allPts.length === 0) return null
  const minP = Math.min(...allPts)
  const maxP = Math.max(...allPts)
  const range = Math.max(1, maxP - minP)
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR))
  const y = (p: number) => padT + (1 - (p - minP) / range) * (H - padT - padB)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="FIFA 점수 변동 추이 차트">
      {trend.map((t, ti) => (
        <g key={t.teamId}>
          <polyline
            fill="none"
            stroke={TREND_COLORS[ti % TREND_COLORS.length]}
            strokeWidth="2"
            strokeLinejoin="round"
            points={t.series.map((s, i) => `${x(i)},${y(s.points)}`).join(' ')}
          />
          {n > 0 && <circle cx={x(n - 1)} cy={y(t.series[n - 1].points)} r="2.5" fill={TREND_COLORS[ti % TREND_COLORS.length]} />}
        </g>
      ))}
    </svg>
  )
}

/**
 * 실시간 FIFA 랭킹 (실제 FIFA 점수 산정 방식 반영). 이미 치른 경기로 점수·순위를 갱신한 현황표와
 * 진행에 따른 변동 추이 차트를 보여준다. 일별 진행에 연동되어 날짜를 넘길수록 갱신된다.
 */
function QualLiveRanking({ result, myTeamId }: { result: AllQualificationResult; myTeamId: string | null }) {
  const revealed = useQualificationStore((s) => s.revealed)
  const rankingBase = useCareerStore((s) => s.rankingBase)
  const [sortMode, setSortMode] = useState<'rank' | 'up' | 'down'>('rank')
  const [expanded, setExpanded] = useState(false)

  // 이전 대회들에서 이월된 FIFA 점수(있으면 시작 점수로 사용).
  const carried = useMemo(() => (Object.keys(rankingBase).length > 0 ? rankingBase : undefined), [rankingBase])
  const calendar = useMemo(() => buildQualCalendar(result), [result])
  const played = useMemo(() => flattenPlayed(collectPlayedByConfed(result, revealed)), [result, revealed])
  const ranking = useMemo(() => computeLiveRanking(result, played, undefined, carried), [result, played, carried])

  // 진행된 경기일까지의 변동 추이(상위 5팀 + 내 팀)
  const dayCount = useMemo(
    () =>
      calendar.filter((d) => Object.keys(d.revealedByConfed).every((c) => d.revealedByConfed[c] <= (revealed[c] ?? 0)))
        .length,
    [calendar, revealed],
  )
  const chartIds = useMemo(() => {
    const top = ranking.slice(0, 5).map((r) => r.teamId)
    if (myTeamId && ALL_NATIONS_BY_ID[myTeamId] && !top.includes(myTeamId)) top.push(myTeamId)
    return top
  }, [ranking, myTeamId])
  const trend = useMemo(
    () => computeRankingTrend(result, calendar.slice(0, dayCount), chartIds, carried),
    [result, calendar, dayCount, chartIds, carried],
  )

  const sorted = useMemo(() => {
    if (sortMode === 'up') return [...ranking].sort((a, b) => b.rankDelta - a.rankDelta)
    if (sortMode === 'down') return [...ranking].sort((a, b) => a.rankDelta - b.rankDelta)
    return ranking
  }, [ranking, sortMode])

  const limit = expanded ? 50 : 20
  const shown = sorted.slice(0, limit)
  // 내 팀이 목록 밖이면 따로 덧붙인다
  const myRow = myTeamId ? ranking.find((r) => r.teamId === myTeamId) : undefined
  const showMyExtra = myRow && !shown.some((r) => r.teamId === myTeamId)

  const DeltaBadge = ({ rankDelta, pointsDelta }: { rankDelta: number; pointsDelta: number }) => {
    if (rankDelta === 0 && pointsDelta === 0) return <span className="text-[10px] text-gray-600">–</span>
    const up = rankDelta > 0 || (rankDelta === 0 && pointsDelta > 0)
    return (
      <span className={`text-[10px] font-bold tabular-nums ${up ? 'text-emerald-300' : 'text-red-300'}`}>
        {rankDelta !== 0 && `${up ? '▲' : '▼'}${Math.abs(rankDelta)} `}
        <span className="font-normal">({pointsDelta >= 0 ? '+' : ''}{pointsDelta})</span>
      </span>
    )
  }

  const RankRow = ({ row }: { row: LiveRankRow }) => (
    <tr className={`border-t border-white/5 ${row.teamId === myTeamId ? 'bg-sky-500/10' : ''}`}>
      <td className="py-1.5 text-center text-gray-500 tabular-nums">{row.rank}</td>
      <th scope="row" className="py-1.5 font-normal">
        <span className="inline-flex items-center gap-1.5">
          <NationLabel teamId={row.teamId} />
          {row.teamId === myTeamId && <span className="rounded bg-sky-500/25 px-1 text-[9px] font-bold text-sky-200">내 팀</span>}
        </span>
      </th>
      <td className="py-1.5 text-right font-bold tabular-nums text-white">{row.points}</td>
      <td className="py-1.5 text-right"><DeltaBadge rankDelta={row.rankDelta} pointsDelta={row.pointsDelta} /></td>
    </tr>
  )

  return (
    <GlassCard className="p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-sky-300">📊 실시간 FIFA 랭킹</h3>
        <div className="flex rounded-lg bg-white/10 p-0.5 text-[11px]">
          {([['rank', '순위순'], ['up', '급상승'], ['down', '급하락']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setSortMode(m)}
              aria-pressed={sortMode === m}
              className={`rounded-md px-2 py-0.5 ${sortMode === m ? 'bg-sky-500/30 text-sky-200' : 'text-gray-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-2 text-[10px] text-gray-500">
        실제 FIFA 점수 산정 방식(P = P + I×(승점−기대승점), 예선 I=25)으로 진행 결과를 반영합니다.
      </p>

      {trend[0]?.series.length > 1 && (
        <div className="mb-3">
          <p className="mb-1 text-[11px] font-bold text-gray-300">📈 점수 변동 추이 (상위권)</p>
          <RankingTrendChart trend={trend} />
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {trend.map((t, ti) => (
              <span key={t.teamId} className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: TREND_COLORS[ti % TREND_COLORS.length] }} />
                {ALL_NATIONS_BY_ID[t.teamId]?.nameKo ?? t.teamId}
                <span className="tabular-nums text-gray-500">{t.series[t.series.length - 1].points}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[300px] text-left text-xs sm:text-sm">
          <caption className="sr-only">실시간 FIFA 랭킹 점수 현황</caption>
          <thead>
            <tr className="text-gray-400">
              <th scope="col" className="w-8 py-1 text-center">순위</th>
              <th scope="col" className="py-1">국가</th>
              <th scope="col" className="w-16 py-1 text-right">점수</th>
              <th scope="col" className="w-20 py-1 text-right">등락</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <RankRow key={row.teamId} row={row} />
            ))}
            {showMyExtra && myRow && (
              <>
                <tr>
                  <td colSpan={4} className="py-0.5 text-center text-[10px] text-gray-600">⋯</td>
                </tr>
                <RankRow row={myRow} />
              </>
            )}
          </tbody>
        </table>
      </div>
      {ranking.length > 20 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full rounded-lg bg-white/5 py-1.5 text-[11px] text-gray-300 hover:bg-white/10"
        >
          {expanded ? '접기' : `더 보기 (상위 50위까지)`}
        </button>
      )}
    </GlassCard>
  )
}

/** 일별 진행 (B2). 경기 일정(캘린더)을 날짜별로 넘기며 그날의 경기·결과를 보고,
 *  모든 대륙 순위표를 해당 날짜 기준으로 동기화한다. */
function QualDailyProgress({ result, onSelectMatch, confed }: { result: AllQualificationResult; onSelectMatch: (m: MatchResult) => void; confed: Confederation }) {
  const calendar = useMemo(() => buildQualCalendar(result), [result])
  // 대륙별 스테이지 구간을 미리 계산해, 그날 각 대륙이 어느 스테이지·라운드인지 표기한다(일정↔룰 연결).
  const stagesByConfed = useMemo(() => {
    const out: Record<string, ReturnType<typeof deriveQualStages>> = {}
    for (const c of Object.keys(result.byConfederation)) out[c] = deriveQualStages(result.byConfederation[c])
    return out
  }, [result])
  const setRevealedMany = useQualificationStore((s) => s.setRevealedMany)
  const revealed = useQualificationStore((s) => s.revealed)
  // 현재 공개 상태(revealed)와 정확히 일치하는 경기일을 찾는다(시뮬 직후엔 1일차). 없으면 1일차.
  const initialIdx = useMemo(() => {
    const i = calendar.findIndex((d) =>
      Object.keys(d.revealedByConfed).every((c) => (revealed[c] ?? -1) === d.revealedByConfed[c]),
    )
    return i >= 0 ? i : 0
    // revealed는 시뮬/네비게이션 시점의 값만 필요 → calendar 변경에만 재계산
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar])
  const [dayIdx, setDayIdx] = useState(initialIdx)

  // 새 시뮬레이션(캘린더 교체) 시 해당 경기일로 초기화(기본 1일차부터 진행).
  useEffect(() => {
    setDayIdx(initialIdx)
  }, [initialIdx])

  if (calendar.length === 0) return null
  const day = calendar[Math.max(0, Math.min(dayIdx, calendar.length - 1))]

  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(calendar.length - 1, i))
    setDayIdx(clamped)
    setRevealedMany(calendar[clamped].revealedByConfed)
  }

  // 그날 경기를 대륙별로 묶기
  const byConfed = new Map<string, typeof day.matches>()
  for (const cm of day.matches) {
    const arr = byConfed.get(cm.confederation)
    if (arr) arr.push(cm)
    else byConfed.set(cm.confederation, [cm])
  }
  // 현재 선택된 대륙 탭의 경기만 선별해 보여준다.
  const confedOrder = byConfed.has(confed) ? [confed] : []
  const shownCount = byConfed.get(confed)?.length ?? 0
  const atEnd = dayIdx >= calendar.length - 1
  const atStart = dayIdx <= 0

  return (
    <GlassCard className="p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-emerald-300">
          📅 일별 진행 <span className="text-gray-400">· {CONFEDERATION_LABEL_KO[confed]}</span>
        </h3>
        <span className="text-xs text-gray-400">
          경기일 <span className="font-bold text-emerald-300">{dayIdx + 1}</span> / {calendar.length}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-base font-bold text-white">{day.label}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => goTo(0)} disabled={atStart} className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:bg-white/20 disabled:opacity-30">⏮ 처음</button>
          <button onClick={() => goTo(dayIdx - 1)} disabled={atStart} className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:bg-white/20 disabled:opacity-30">◀ 이전</button>
          <button onClick={() => goTo(dayIdx + 1)} disabled={atEnd} className="rounded bg-emerald-500/20 px-2 py-1 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-30">다음 경기일 ▶</button>
          <button onClick={() => goTo(calendar.length - 1)} disabled={atEnd} className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:bg-white/20 disabled:opacity-30">⏭ 끝</button>
        </div>
      </div>
      <p className="mb-2 text-[11px] text-gray-500">
        {CONFEDERATION_LABEL_KO[confed]} · {shownCount}경기
        <span className="ml-1 text-gray-600">(이 날 전체 {day.matches.length}경기 중)</span>
      </p>
      <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {confedOrder.length === 0 && (
          <p className="rounded-lg bg-white/5 px-3 py-4 text-center text-[11px] text-gray-500">
            이 경기일에 {CONFEDERATION_LABEL_KO[confed]} 경기가 없습니다. <strong>다음 경기일 ▶</strong>로 넘겨보세요.
          </p>
        )}
        {confedOrder.map((c) => {
          const list = byConfed.get(c)!
          // 그날 이 대륙의 라운드·스테이지(모든 경기가 같은 라운드에 열림)를 표기해 일정을 룰과 연결한다.
          const roundMd = list[0]?.match.matchday
          const stageName = roundMd != null ? stageNameAt(stagesByConfed[c] ?? [], roundMd) : null
          return (
            <div key={c}>
              <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-gray-300">
                {CONFEDERATION_LABEL_KO[c as Confederation] ?? c} <span className="text-gray-500">({list.length})</span>
                {stageName && (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
                    {stageName} · R{roundMd}
                  </span>
                )}
              </p>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {list.map((cm, i) => (
                  <button
                    key={i}
                    onClick={() => onSelectMatch(cm.match)}
                    className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1 text-[11px] hover:bg-white/10"
                  >
                    <span className="min-w-0 flex-1 truncate text-right text-gray-300">{ALL_NATIONS_BY_ID[cm.match.homeTeamId]?.nameKo ?? cm.match.homeTeamId}</span>
                    <span className="shrink-0 font-bold tabular-nums text-white">{cm.match.homeGoals}-{cm.match.awayGoals}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-300">{ALL_NATIONS_BY_ID[cm.match.awayTeamId]?.nameKo ?? cm.match.awayTeamId}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] text-gray-500">※ 경기일을 넘기면 아래 대륙별 순위표가 그 날짜 기준으로 함께 갱신됩니다.</p>
    </GlassCard>
  )
}

const HIGHLIGHT_STYLE: Record<string, string> = {
  대이변: 'bg-red-500/20 text-red-300',
  대승: 'bg-emerald-500/20 text-emerald-300',
  골잔치: 'bg-sky-500/20 text-sky-300',
  명승부: 'bg-amber-500/20 text-amber-300',
}

/** 예선 명장면 피드 (F3). 드라마 점수 상위 경기들을 유형 태그와 함께 보여준다. */
function QualHighlightsCard({ result, onSelectMatch }: { result: AllQualificationResult; onSelectMatch: (m: MatchResult) => void }) {
  const highlights = useMemo(() => computeQualHighlights(result, 6), [result])
  if (highlights.length === 0) return null
  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-sm font-bold text-amber-300">🎬 예선 명장면</h3>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {highlights.map((h, i) => (
          <button
            key={i}
            onClick={() => onSelectMatch(h.match)}
            className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2 text-left text-xs hover:bg-white/10"
          >
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${HIGHLIGHT_STYLE[h.category] ?? 'bg-white/10 text-gray-300'}`}>
              {h.category}
            </span>
            <span className="min-w-0 flex-1 truncate text-right text-gray-300">
              {ALL_NATIONS_BY_ID[h.match.homeTeamId]?.nameKo ?? h.match.homeTeamId}
            </span>
            <span className="shrink-0 font-bold tabular-nums text-white">{h.match.homeGoals}-{h.match.awayGoals}</span>
            <span className="min-w-0 flex-1 truncate text-gray-300">
              {ALL_NATIONS_BY_ID[h.match.awayTeamId]?.nameKo ?? h.match.awayTeamId}
            </span>
            <span className="shrink-0 text-[9px] text-gray-600">{CONFEDERATION_LABEL_KO[h.confederation as Confederation] ?? h.confederation}</span>
          </button>
        ))}
      </div>
    </GlassCard>
  )
}

/** 대륙 예선 개요 그리드 (H2). 전 대륙 진행·슬롯·대표 진출국을 한눈에. */
function QualOverviewCard({ result, onSelect }: { result: AllQualificationResult; onSelect: (c: Confederation) => void }) {
  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-sm font-bold text-gray-200">🗺️ 대륙 예선 개요</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CONFEDS.map((c) => {
          const r = result.byConfederation[c]
          if (!r) return null
          const participants = new Set(r.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId])).size
          const topQualifier = r.qualified[0]
          return (
            <button
              key={c}
              onClick={() => onSelect(c)}
              className="rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-200">{CONFEDERATION_LABEL_KO[c]}</span>
                <span className="flex gap-1">
                  <span className="rounded bg-emerald-500/20 px-1 text-[9px] font-bold tabular-nums text-emerald-300">직행 {r.qualified.length}</span>
                  {r.playoff.length > 0 && (
                    <span className="rounded bg-amber-500/20 px-1 text-[9px] font-bold tabular-nums text-amber-300">PO {r.playoff.length}</span>
                  )}
                </span>
              </div>
              <p className="text-[10px] text-gray-500">{participants}팀 · {r.groups.length}개 조 · {r.matchdays}R</p>
              {topQualifier && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-300">
                  <span className="text-[9px] text-gray-500">대표</span>
                  <NationLabel teamId={topQualifier} interactive={false} />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </GlassCard>
  )
}

/** 예선 결과 공유 (E5). 시드가 결과를 완전 재현하므로 요약+시드를 클립보드에 복사한다. */
function QualShareButton({ seed, result, myTeamId }: { seed: string | null; result: AllQualificationResult; myTeamId: string | null }) {
  const [copied, setCopied] = useState(false)
  const summary = useMemo(() => {
    const lines = ['🌍 2026 북중미 월드컵 지역예선 시뮬레이션', `예선 시드: ${seed ?? '(무작위)'}`, '본선 진출 48개국 확정!']
    if (myTeamId && ALL_NATIONS_BY_ID[myTeamId]) {
      const inFinals = result.qualified48.includes(myTeamId)
      lines.push(`내 팀 ${ALL_NATIONS_BY_ID[myTeamId].nameKo}: ${inFinals ? '✅ 본선 진출' : '💔 본선 진출 실패'}`)
    }
    lines.push('같은 시드로 같은 결과를 재현할 수 있어요.')
    return lines.join('\n')
  }, [seed, result, myTeamId])

  const share = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(summary).catch(() => {})
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <GlassButton variant="ghost" onClick={share} title="예선 시드와 요약을 복사합니다">
      {copied ? '✅ 복사됨!' : '🔗 예선 공유'}
    </GlassButton>
  )
}

/** What-if 진출 분석 (G3). 내 팀 전력을 가정해 진출 확률 변화를 몬테카를로로 추정. */
function QualWhatIfCard({ teamId, seedBase }: { teamId: string; seedBase: string }) {
  const [scenarios, setScenarios] = useState<WhatIfScenario[] | null>(null)
  const [loading, setLoading] = useState(false)
  const nation = ALL_NATIONS_BY_ID[teamId]

  if (!nation) return null

  const run = () => {
    setLoading(true)
    // 무거운 몬테카를로가 UI 페인트를 막지 않도록 한 틱 뒤 실행.
    setTimeout(() => {
      const s = runWhatIfScenarios(teamId, [-10, -5, 0, 5, 10], 60, `${seedBase}-${teamId}`)
      setScenarios(s)
      setLoading(false)
    }, 20)
  }

  const labelFor = (d: number) => (d === 0 ? '현재 전력' : d > 0 ? `+${d} 강화` : `${d} 약화`)

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-sky-300">🔮 What-if · {nation.nameKo} 전력별 진출 확률</h3>
        <GlassButton variant="ghost" onClick={run} disabled={loading}>
          {loading ? '계산 중…' : scenarios ? '🔄 다시 분석' : '분석 실행'}
        </GlassButton>
      </div>
      {!scenarios && !loading && (
        <p className="text-[11px] text-gray-500">내 팀 전력을 ±로 가정했을 때 본선 진출 확률이 어떻게 달라지는지 시뮬레이션합니다.</p>
      )}
      {scenarios && (
        <div className="space-y-2">
          {scenarios.map((s) => (
            <div key={s.delta} className="flex items-center gap-2 text-xs">
              <span className={`w-20 shrink-0 ${s.delta === 0 ? 'font-bold text-sky-300' : 'text-gray-400'}`}>{labelFor(s.delta)}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full ${s.delta === 0 ? 'bg-sky-400/70' : 'bg-emerald-500/50'}`}
                  style={{ width: `${s.probability}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-bold tabular-nums text-white">{s.probability.toFixed(0)}%</span>
            </div>
          ))}
          <p className="pt-1 text-[10px] text-gray-500">※ 각 시나리오 60회 시뮬레이션 표본 추정치입니다.</p>
        </div>
      )}
    </GlassCard>
  )
}

/** 예선 이변 기사 (F2). 최대 이변 경기를 뉴스 기사 형태로 생성해 보여준다. */
function QualUpsetArticleCard({ result }: { result: AllQualificationResult }) {
  const article = useMemo(() => {
    const params = pickQualUpset(result)
    return params ? { params, article: generateUpsetArticle(params) } : null
  }, [result])
  if (!article) return null
  const { params, article: a } = article
  const winner = ALL_NATIONS_BY_ID[params.winnerTeamId]
  const loser = ALL_NATIONS_BY_ID[params.loserTeamId]
  return (
    <GlassCard className="p-4">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-gray-200">
          <span>📰 예선 이변 기사</span>
          <span className="text-xs text-gray-500 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <article className="mt-3">
          <h4 className="mb-2 font-display text-base font-bold leading-snug text-white">{a.headline}</h4>
          <div className="mb-3 flex items-center gap-2 text-[11px] text-gray-400">
            <NationLabel teamId={params.winnerTeamId} />
            <span className="font-bold tabular-nums text-white">{params.winnerGoals}-{params.loserGoals}</span>
            <NationLabel teamId={params.loserTeamId} />
            <span className="text-gray-600">· {params.roundLabel}</span>
          </div>
          <div className="space-y-2 text-xs leading-relaxed text-gray-300">
            {a.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-gray-600">
            ※ FIFA 랭킹 {winner?.fifaRankApprox}위 {winner?.nameKo}가 {loser?.fifaRankApprox}위 {loser?.nameKo}를 꺾은 결과 기반 · 가상 기사
          </p>
        </article>
      </details>
    </GlassCard>
  )
}

/** 행운/불운 분석 (G5). 진출 확률 대비 실제 결과 — 확률 계산 후에만 노출. */
function QualLuckCard({ result, probabilities }: { result: AllQualificationResult; probabilities: Record<string, number> }) {
  const luck = useMemo(() => computeLuckAnalysis(result, probabilities), [result, probabilities])
  if (luck.lucky.length === 0 && luck.unlucky.length === 0) return null
  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-sm font-bold text-sky-300">🎲 행운 · 불운 (확률 대비 결과)</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-bold text-emerald-300">🍀 행운의 진출 (낮은 확률로 뚫음)</p>
          <div className="space-y-1">
            {luck.lucky.length === 0 && <p className="text-[11px] text-gray-600">해당 없음</p>}
            {luck.lucky.map((e) => (
              <div key={e.teamId} className="flex items-center justify-between text-xs">
                <NationLabel teamId={e.teamId} />
                <span className="text-[10px] text-gray-500">진출 확률 {e.probability.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-bold text-red-300">😢 아쉬운 탈락 (높은 확률인데 미끄러짐)</p>
          <div className="space-y-1">
            {luck.unlucky.length === 0 && <p className="text-[11px] text-gray-600">해당 없음</p>}
            {luck.unlucky.map((e) => (
              <div key={e.teamId} className="flex items-center justify-between text-xs">
                <NationLabel teamId={e.teamId} />
                <span className="text-[10px] text-gray-500">진출 확률 {e.probability.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  )
}

/** 대륙 난이도 지수 (G4). 진출 자리 하나당 경쟁 팀 수를 대륙별로 비교한다. */
function QualDifficultyCard() {
  const diff = useMemo(() => computeConfedDifficulty(), [])
  const maxRatio = Math.max(...diff.map((d) => d.ratio))
  return (
    <GlassCard className="p-4">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-gray-200">
          <span>🌡️ 대륙 예선 난이도 (자리당 경쟁 팀 수)</span>
          <span className="text-xs text-gray-500 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3 space-y-2">
          {diff.map((d) => (
            <div key={d.confederation} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 text-gray-300">{CONFEDERATION_LABEL_KO[d.confederation]}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500/60 to-red-500/70"
                  style={{ width: `${(d.ratio / maxRatio) * 100}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right tabular-nums text-gray-400">
                <span className="font-bold text-white">{d.ratio.toFixed(1)}</span>
                <span className="ml-1 text-[10px]">({d.participants}팀/{d.spots}자리)</span>
              </span>
            </div>
          ))}
          <p className="pt-1 text-[10px] text-gray-500">※ 숫자가 높을수록 자리 하나를 두고 더 많은 팀이 경쟁 — 진출이 치열합니다.</p>
        </div>
      </details>
    </GlassCard>
  )
}

/** 내 팀 예선 결과 배너 (E1·E3). 본선 진출/탈락·경로 + 진출 확률을 강조 표시한다. */
function MyTeamQualBanner({
  teamId,
  qualified48,
  hosts,
  probability,
  fullyRevealed,
}: {
  teamId: string
  qualified48: string[]
  hosts: string[]
  probability?: number
  /** 예선이 전부 진행돼 결과가 확정됐는지. false면 진출 여부를 스포일러하지 않는다. */
  fullyRevealed: boolean
}) {
  const nation = ALL_NATIONS_BY_ID[teamId]
  if (!nation) return null
  const isHost = hosts.includes(teamId)
  const isIn = qualified48.includes(teamId)
  // 개최국은 예선과 무관하게 자동 진출이라 진행 중에도 알려도 무방. 그 외엔 예선을 다 봐야 결과 공개.
  const decided = fullyRevealed || isHost
  // 색: 확정 전엔 중립(진행 중), 확정 후엔 진출/실패로 구분.
  const tone = !decided ? 'border-white/10 bg-white/5' : isIn || isHost ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-red-400/30 bg-red-500/10'
  const statusText = isHost
    ? '🏟️ 개최국 자동 진출!'
    : !fullyRevealed
      ? '🔄 예선 진행 중'
      : isIn
        ? '✅ 본선 진출!'
        : '💔 본선 진출 실패'
  const statusColor = !decided ? 'text-gray-200' : isIn || isHost ? 'text-emerald-200' : 'text-red-200'
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${tone}`}>
      <FlagIcon iso2={nation.iso2} className="h-6 w-9 shrink-0 rounded-sm" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-400">
          내 팀 · {CONFEDERATION_LABEL_KO[nation.confederation]} · FIFA {nation.fifaRankApprox}위
        </p>
        <p className={`text-sm font-bold ${statusColor}`}>
          {nation.nameKo} {statusText}
        </p>
      </div>
      {probability != null && !isHost && (
        <div className="shrink-0 text-right">
          <p className="text-[10px] text-gray-400">{fullyRevealed ? '진출 확률' : '진출 확률(예상)'}</p>
          <p className="text-lg font-bold tabular-nums text-sky-300">{probability.toFixed(0)}%</p>
          <p className="text-[9px] text-gray-500 tabular-nums">±{probMarginPct(probability, PROB_ITERATIONS).toFixed(1)}%</p>
        </div>
      )}
    </div>
  )
}

/** 직행/PO/탈락 상태 배지 (색+아이콘+텍스트 병행, I4). 진행 중이면 '—'. */
function ResultBadge({
  full,
  direct,
  po,
  provDirect,
  provPo,
}: {
  full: boolean
  direct: boolean
  po: boolean
  /** 진행 중 잠정 진출 상황(현재 순위 기준) */
  provDirect?: boolean
  provPo?: boolean
}) {
  if (!full) {
    // 진행 중: 현재 순위 기준 잠정 진출 상황(점선 테두리로 '확정 아님' 표시)
    if (provDirect) return <span className="rounded border border-dashed border-emerald-400/50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300/90">잠정 직행</span>
    if (provPo) return <span className="rounded border border-dashed border-amber-400/50 px-1.5 py-0.5 text-[10px] font-bold text-amber-300/90">잠정 PO</span>
    return <span className="text-[10px] text-gray-600">—</span>
  }
  if (direct) return <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">✅ 직행</span>
  if (po) return <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">🎯 PO</span>
  return <span className="text-[10px] text-gray-600">탈락</span>
}

/** 대륙간 플레이오프 브래킷 (F4). 준결승 2경기 → 시드와의 결승 2경기 → 본선 2장. */
function InterConfedBracket({ result }: { result: InterConfedResult }) {
  const bySlot = new Map(result.matches.map((m) => [m.slotId, m] as const))
  const winnerSet = new Set(result.winners)

  function TeamRow({ teamId, goals, isWinner, bye }: { teamId: string; goals?: number; isWinner: boolean; bye?: boolean }) {
    return (
      <div
        className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-[11px] ${
          isWinner ? 'bg-emerald-500/15 text-emerald-100' : 'bg-white/5 text-gray-300'
        }`}
      >
        <NationLabel teamId={teamId} className={isWinner ? 'font-bold' : ''} />
        <span className="shrink-0 tabular-nums text-gray-400">{bye ? '부전승' : goals ?? '–'}</span>
      </div>
    )
  }

  function MatchBox({ slotId, label, byeSeed }: { slotId?: string; label: string; byeSeed?: string }) {
    const m = slotId ? bySlot.get(slotId) : undefined
    if (byeSeed && !m) {
      return (
        <div className="min-w-[150px] space-y-1">
          <p className="text-[10px] font-bold text-gray-500">{label}</p>
          <TeamRow teamId={byeSeed} isWinner bye />
        </div>
      )
    }
    if (!m) return null
    const homeWin = m.winnerTeamId === m.homeTeamId
    return (
      <div className="min-w-[150px] space-y-1">
        <p className="text-[10px] font-bold text-gray-500">
          {label}
          {m.wentToPenalties && <span className="ml-1 text-amber-300">(PK)</span>}
        </p>
        <TeamRow teamId={m.homeTeamId} goals={m.homeGoals} isWinner={homeWin} />
        <TeamRow teamId={m.awayTeamId} goals={m.awayGoals} isWinner={!homeWin} />
      </div>
    )
  }

  // 브래킷 데이터가 없으면(엣지) 렌더 생략 → 상위에서 리스트로 폴백
  if (!bySlot.has('ICP-F1') && !bySlot.has('ICP-F2')) return null
  const f1 = bySlot.get('ICP-F1')
  const f2 = bySlot.get('ICP-F2')
  const seed1 = f1?.homeTeamId
  const seed2 = f2?.homeTeamId

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {[
        { sf: 'ICP-SF1', fin: 'ICP-F1', seed: seed1, pathNo: 1 },
        { sf: 'ICP-SF2', fin: 'ICP-F2', seed: seed2, pathNo: 2 },
      ].map(({ sf, fin, seed, pathNo }) => {
        const fin_m = bySlot.get(fin)
        const finWinner = fin_m?.winnerTeamId
        return (
          <div key={fin} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-[11px] font-bold text-amber-200">진출 경로 {pathNo}</p>
            <div className="flex flex-wrap items-stretch gap-2">
              <MatchBox slotId={sf} label="준결승" />
              <div className="flex items-center text-gray-600" aria-hidden>→</div>
              <MatchBox slotId={fin} label={seed ? '결승 (시드)' : '결승'} />
            </div>
            {finWinner && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300">
                <span aria-hidden>✅</span> 본선 진출:{' '}
                <NationLabel teamId={finWinner} className="font-bold" />
              </p>
            )}
          </div>
        )
      })}
      <p className="sr-only">{[...winnerSet].map((id) => ALL_NATIONS_BY_ID[id]?.nameKo).join(', ')} 본선 진출</p>
    </div>
  )
}

/** 선택한 대륙 예선의 룰(라운드 구조·슬롯·진출 방식)을 접이식으로 설명한다 — "각 예선별 룰을 제대로". */
function QualRulesPanel({ confed }: { confed: Confederation }) {
  const rule = QUAL_RULES[confed]
  return (
    <details className="group mb-3 rounded-lg border border-sky-400/20 bg-sky-500/[0.06]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-sky-200">
        <span className="flex items-center gap-1.5">
          📖 {CONFEDERATION_LABEL_KO[confed]} 예선 룰
          <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold text-sky-100">{rule.slots}</span>
        </span>
        <span className="text-gray-400 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-2 px-3 pb-3">
        <p className="text-[11px] text-gray-300">{rule.summary}</p>
        <ol className="space-y-1.5">
          {rule.stages.map((st, i) => (
            <li key={i} className="rounded-md bg-white/5 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/25 text-[9px] font-bold text-emerald-200 tabular-nums">
                  {i + 1}
                </span>
                <span className="text-[11px] font-bold text-gray-100">{st.name}</span>
                <span className="text-[10px] text-gray-400">— {st.format}</span>
              </div>
              <p className="mt-0.5 pl-6 text-[10px] text-emerald-300/90">→ {st.advance}</p>
            </li>
          ))}
        </ol>
        {rule.note && <p className="text-[10px] text-gray-500">※ {rule.note}</p>}
        <p className="border-t border-white/10 pt-1.5 text-[10px] text-gray-500">
          🎯 대륙간 플레이오프: {INTER_CONFED_RULE.summary}. {INTER_CONFED_RULE.detail}
        </p>
      </div>
    </details>
  )
}

/** 예선 스테이지(라운드) 진행현황 타임라인 — 완료/진행 중/예정을 한눈에 (월드컵급 진행현황). */
function QualStageTimeline({ r, revealed }: { r: QualificationResult; revealed: number }) {
  const stages = useMemo(() => deriveQualStages(r), [r])
  if (stages.length <= 1) return null // 단일 스테이지 대륙은 타임라인이 의미가 적어 생략
  const active = stages.find((s) => stageStatus(s, revealed) === 'active')
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-gray-300">
        <span>🗺️ 예선 진행 단계</span>
        {active && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">현재: {active.name}</span>}
      </div>
      <ol className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {stages.map((st, i) => {
          const status = stageStatus(st, revealed)
          const cls =
            status === 'done'
              ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-100'
              : status === 'active'
                ? 'border-amber-400/50 bg-amber-500/25 text-amber-50 ring-1 ring-amber-400/40'
                : 'border-white/10 bg-white/5 text-gray-500'
          return (
            <li key={st.name} className="flex items-center gap-1">
              <div className={`min-w-[64px] rounded-md border px-2 py-1 text-center ${cls}`}>
                <div className="text-[10px] font-bold leading-tight">{st.name}</div>
                <div className="text-[8px] opacity-75 tabular-nums">R{st.startMd}–{st.endMd}</div>
                <div className="text-[8px] font-bold">{status === 'done' ? '✓ 완료' : status === 'active' ? '● 진행 중' : '○ 예정'}</div>
              </div>
              {i < stages.length - 1 && <span className="text-[10px] text-gray-600">›</span>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function ConfederationStandings({
  confed,
  onSelectMatch,
  myTeamId,
}: {
  confed: Confederation
  onSelectMatch: (m: MatchResult) => void
  myTeamId: string | null
}) {
  const result = useQualificationStore((s) => s.result)
  const stageProbs = useQualificationStore((s) => s.stageProbabilities)
  const revealedMap = useQualificationStore((s) => s.revealed)
  const setRevealed = useQualificationStore((s) => s.setRevealed)
  // 선택된 예선 차수(스테이지) 탭. null이면 '현재 진행 중인 차수'를 따라간다. 대륙을 바꾸면 리셋.
  const [selectedStageName, setSelectedStageName] = useState<string | null>(null)
  useEffect(() => {
    setSelectedStageName(null)
  }, [confed])
  const r = result?.byConfederation[confed]
  if (!r) return null
  const total = r.matchdays
  const revealed = revealedMap[confed] ?? total
  const full = revealed >= total
  const shownMatches = r.matches.filter((m) => m.matchday <= revealed)
  const qSet = new Set(r.qualified)
  const pSet = new Set(r.playoff)
  const GROUP_LETTERS = 'ABCDEFGHIJKL'.split('')
  const single = r.groups.length <= 1

  // 진행 중 잠정 진출 현황(현재 순위 기준). 단일 조별 대륙만 — 다단계(AFC·CONCACAF)는 스테이지
  // 로직이라 횡단 순위 투영이 부정확하므로 잠정 표시를 생략한다.
  const provisional = ((): { direct: Set<string>; po: Set<string> } => {
    if (full || r.groupLabels) return { direct: new Set(), po: new Set() }
    const provRankings = r.groups.map((fo, gi) => rankGroupTeams(fo, shownMatches.filter((m) => m.group === gi)))
    const order = rankAcrossGroups(provRankings, shownMatches, r.standings)
    return {
      direct: new Set(order.slice(0, r.qualified.length)),
      po: new Set(order.slice(r.qualified.length, r.qualified.length + r.playoff.length)),
    }
  })()

  // 이 대륙에 속한 현재 대회 개최국(예선 없이 자동 진출) — 커리어 모드로 매 대회 바뀔 수 있다.
  const confedHosts = getCurrentHostIds().filter((id) => ALL_NATIONS_BY_ID[id]?.confederation === confed)

  // 예선 차수(스테이지) 서브탭 — 다단계 대륙만. 현재 진행 중인 차수를 기본 선택한다.
  const stages = deriveQualStages(r)
  const useStageTabs = stages.length > 1
  const activeStage =
    stages.find((s) => stageStatus(s, revealed) === 'active') ??
    [...stages].reverse().find((s) => stageStatus(s, revealed) === 'done') ??
    stages[0]
  const effectiveStageName =
    selectedStageName && stages.some((s) => s.name === selectedStageName) ? selectedStageName : activeStage?.name
  const selectedStage = stages.find((s) => s.name === effectiveStageName)
  // 선택 차수에 속한 조만 노출한다(다른 차수 경기/순위는 그 탭에서 생략).
  const visibleGroupIdx = new Set<number>(
    useStageTabs && selectedStage ? selectedStage.groupIndices : r.groups.map((_, i) => i),
  )
  // 아직 시작되지 않은 차수는 진출국이 스포일러가 되므로 조/순위를 감춘다.
  const selectedStageUpcoming = !!(useStageTabs && selectedStage && stageStatus(selectedStage, revealed) === 'upcoming')

  // 단계별 진출 확률 체인 — 선택 차수 이후 '남은 모든 차수 + 본선진출' 도달 확률을 실시간 조건부로 보여준다.
  const QUALIFY_KEY = '본선진출'
  const stageOrder = stageProbs?.stageOrderByConfed[confed] ?? stages.map((s) => s.name)
  const selStageIdx = selectedStage ? stageOrder.indexOf(selectedStage.name) : -1
  // 남은 차수(현재 차수 다음부터) + 마지막에 본선진출. 단일리그(CONMEBOL 등)는 본선진출만.
  const remainingStages = selStageIdx >= 0 ? stageOrder.slice(selStageIdx + 1) : []
  const chainKeys: string[] = !!stageProbs && !selectedStageUpcoming ? [...remainingStages, QUALIFY_KEY] : []
  const stagePctFor = (teamId: string, key: string): number => stageProbs?.byTeam[teamId]?.[key] ?? 0
  // 컬럼 헤더용 짧은 라벨("3차 예선"→"3차", "본선진출"→"본선", "플레이오프"→"PO" 등).
  const shortStageLabel = (name: string): string =>
    name === QUALIFY_KEY ? '본선' : name.replace(/\s?예선$/, '').replace('플레이오프', 'PO').replace('최종 라운드', '최종')

  // FIFA 랭킹 시드 자동진출 판정: 이 차수보다 앞선 차수에 편성된 적 없는데 이 차수에 있으면
  // 하위 라운드를 건너뛰고 랭킹 시드로 자동진출한 국가다(예: AFC 상위국이 1차 없이 2차부터 참가).
  const priorStageTeams = new Set<string>()
  for (const st of stages) {
    if (st === selectedStage) break
    for (const gi of st.groupIndices) for (const t of r.groups[gi] ?? []) priorStageTeams.add(t)
  }
  const isSeedAdvanced = (teamId: string): boolean =>
    useStageTabs && selStageIdx > 0 && !selectedStageUpcoming && !priorStageTeams.has(teamId)

  // 이 차수 조추첨 포트(랭킹 시드) — 조가 2개 이상인 조별 차수만. 조 크기만큼 포트를 만든다.
  const stageTeamsSorted = selectedStage
    ? selectedStage.groupIndices.flatMap((gi) => r.groups[gi] ?? []).sort((a, b) => ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox)
    : []
  const stageNumGroups = selectedStage?.groupIndices.length ?? 0
  const firstStageGroupSize = selectedStage ? (r.groups[selectedStage.groupIndices[0]]?.length ?? 0) : 0
  const showDrawPots = !selectedStageUpcoming && useStageTabs && stageNumGroups >= 2 && firstStageGroupSize >= 3
  const drawPots: string[][] = showDrawPots
    ? Array.from({ length: firstStageGroupSize }, (_, p) => stageTeamsSorted.slice(p * stageNumGroups, (p + 1) * stageNumGroups))
    : []

  return (
    <GlassCard className="p-4">
      <QualRulesPanel confed={confed} />

      {confedHosts.length > 0 && (
        <p className="mb-3 text-[11px] text-gray-500">
          개최국({confedHosts.map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join('·')})은 예선 없이 자동 진출하며, 아래는 나머지 국가들의 최종 라운드입니다.
        </p>
      )}

      <QualStageTimeline r={r} revealed={revealed} />

      {useStageTabs && (
        <div role="tablist" aria-label={`${CONFEDERATION_LABEL_KO[confed]} 예선 차수`} className="mb-3 flex flex-wrap gap-1.5">
          {stages.map((s) => {
            const status = stageStatus(s, revealed)
            const selected = s.name === effectiveStageName
            const dot = status === 'done' ? '✓' : status === 'active' ? '●' : '○'
            return (
              <button
                key={s.name}
                role="tab"
                aria-selected={selected}
                onClick={() => setSelectedStageName(s.name)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selected
                    ? 'bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/40'
                    : status === 'active'
                      ? 'bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                <span aria-hidden className="text-[9px]">{dot}</span>
                {s.name}
                {status === 'active' && <span className="text-[8px] font-bold text-amber-300">진행중</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* 이 차수 조추첨 포트(랭킹 시드) — 조가 어떻게 편성됐는지 보여준다 */}
      {showDrawPots && (
        <details className="group mb-3 rounded-lg border border-violet-400/20 bg-violet-500/[0.06]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[11px] font-bold text-violet-200">
            <span>🎩 {selectedStage?.name} 조추첨 포트 (FIFA 랭킹 시드 {stageNumGroups}개 조)</span>
            <span className="text-gray-400 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-4">
            {drawPots.map((pot, pi) => (
              <div key={pi}>
                <p className="mb-1 text-[10px] font-bold text-violet-300">포트 {pi + 1}</p>
                <div className="space-y-0.5">
                  {pot.map((id) => (
                    <div key={id} className="flex items-center gap-1 text-[10px] text-gray-300">
                      <FlagIcon iso2={ALL_NATIONS_BY_ID[id]?.iso2 ?? ''} className="h-2 w-3" />
                      <span className="truncate">{ALL_NATIONS_BY_ID[id]?.nameKo ?? id}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="px-3 pb-2 text-[10px] text-gray-500">
            ※ FIFA 랭킹 순으로 포트를 나눠 각 조에 한 팀씩 배정(뱀 배정)합니다. 상위 포트일수록 강팀입니다.
          </p>
        </details>
      )}

      {/* 랭킹 시드 자동진출 안내 — 이 차수에 하위 라운드 없이 자동진출한 국가가 있으면 표시 */}
      {useStageTabs && selStageIdx > 0 && !selectedStageUpcoming && stageTeamsSorted.some((id) => isSeedAdvanced(id)) && (
        <p className="mb-3 rounded-lg bg-sky-500/10 px-3 py-2 text-[10px] text-sky-200">
          🎖️ FIFA 랭킹 상위국은 하위 라운드를 건너뛰고 <strong>{selectedStage?.name}부터 자동 진출</strong>합니다
          (순위표에 <span className="rounded bg-sky-500/25 px-1 font-bold">시드 자동진출</span> 표시).
        </p>
      )}

      {/* 라운드별 진행 컨트롤 (B1) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-gray-300">
          라운드 <span className="text-emerald-300">{revealed}</span> / {total}
          {!full && <span className="ml-1 text-[10px] font-normal text-amber-300">진행 중</span>}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setRevealed(confed, 1)} disabled={revealed <= 1} className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:bg-white/20 disabled:opacity-30">⏮ 처음</button>
          <button onClick={() => setRevealed(confed, Math.max(1, revealed - 1))} disabled={revealed <= 1} className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:bg-white/20 disabled:opacity-30">◀</button>
          <button onClick={() => setRevealed(confed, Math.min(total, revealed + 1))} disabled={full} className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:bg-white/20 disabled:opacity-30">▶ 다음</button>
          <button onClick={() => setRevealed(confed, total)} disabled={full} className="rounded bg-emerald-500/20 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-30">⏭ 전체</button>
        </div>
      </div>

      {selectedStageUpcoming ? (
        <div className="rounded-lg bg-white/5 p-6 text-center text-xs text-gray-500">
          <p>아직 진행되지 않은 차수입니다. 이전 차수가 끝나면 이 차수 진출국이 확정됩니다.</p>
          <p className="mt-1 text-[10px]">📅 일별 진행에서 라운드를 넘겨 이 차수까지 진행해 보세요.</p>
        </div>
      ) : (
      <div className={single ? '' : 'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
        {r.groups.map((finalOrder, gi) => {
          if (!visibleGroupIdx.has(gi)) return null // 선택된 차수의 조만 노출
          const groupMatches = shownMatches.filter((m) => m.group === gi)
          const groupTeams = rankGroupTeams(finalOrder, groupMatches)
          // 조 자체 경기만으로 순위 지표 계산(다단계 대륙에서 팀이 여러 조에 걸쳐도 정확).
          const gStand = computeStandings(finalOrder, groupMatches)
          const rows = groupTeams.map((teamId, idx) => {
            const s = gStand[teamId]
            return {
              teamId,
              idx,
              s,
              gd: s.goalsFor - s.goalsAgainst,
              direct: full && qSet.has(teamId),
              po: full && pSet.has(teamId),
            }
          })
          const groupLabel = r.groupLabels?.[gi] ?? (single ? '단일리그' : `${GROUP_LETTERS[gi]}조`)
          return (
          <div key={gi}>
            {!single && <p className="mb-1.5 font-display text-xs font-bold text-gray-300">{groupLabel}</p>}
            {/* 데스크톱: 표 */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[360px] text-left text-xs sm:text-sm">
                <caption className="sr-only">
                  {CONFEDERATION_LABEL_KO[confed]} {groupLabel} 순위표
                </caption>
                <thead>
                  <tr className="text-gray-400">
                    <th scope="col" className="w-6 py-1 text-center">#</th>
                    <th scope="col" className="py-1">국가</th>
                    <th scope="col" className="w-10 py-1 text-center">경기</th>
                    <th scope="col" className="w-10 py-1 text-center">승점</th>
                    <th scope="col" className="w-12 py-1 text-center">득실</th>
                    {chainKeys.map((k) => (
                      <th key={k} scope="col" className="w-12 py-1 text-right" title={`${k === QUALIFY_KEY ? '본선' : k} 진출 확률`}>
                        {shortStageLabel(k)}
                      </th>
                    ))}
                    <th scope="col" className="py-1 text-right">결과</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ teamId, idx, s, gd, direct, po }) => (
                    <tr
                      key={teamId}
                      className={`border-t border-white/5 ${teamId === myTeamId ? 'bg-sky-500/10' : direct || provisional.direct.has(teamId) ? 'bg-emerald-500/10' : po || provisional.po.has(teamId) ? 'bg-amber-500/10' : ''}`}
                    >
                      <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                      <th scope="row" className="py-1.5 font-normal">
                        <span className="inline-flex items-center gap-1.5">
                          <NationLabel teamId={teamId} />
                          {teamId === myTeamId && <span className="rounded bg-sky-500/25 px-1 text-[9px] font-bold text-sky-200">내 팀</span>}
                          {isSeedAdvanced(teamId) && <span className="rounded bg-sky-500/25 px-1 text-[9px] font-bold text-sky-200" title="FIFA 랭킹 시드로 하위 라운드 없이 자동진출">시드 자동진출</span>}
                        </span>
                      </th>
                      <td className="py-1.5 text-center text-gray-400 tabular-nums">{s.played}</td>
                      <td className="py-1.5 text-center font-bold text-white tabular-nums">{s.points}</td>
                      <td className="py-1.5 text-center text-gray-400 tabular-nums">{gd > 0 ? `+${gd}` : gd}</td>
                      {chainKeys.map((k) => (
                        <td key={k} className={`py-1.5 text-right tabular-nums ${k === QUALIFY_KEY ? 'font-bold text-sky-300' : 'text-amber-300'}`}>
                          {stagePctFor(teamId, k).toFixed(0)}%
                        </td>
                      ))}
                      <td className="py-1.5 text-right"><ResultBadge full={full} direct={direct} po={po} provDirect={provisional.direct.has(teamId)} provPo={provisional.po.has(teamId)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 모바일: 카드형 순위표 (I2) */}
            <ul className="space-y-1.5 sm:hidden" aria-label={`${CONFEDERATION_LABEL_KO[confed]} ${groupLabel} 순위표`}>
              {rows.map(({ teamId, idx, s, gd, direct, po }) => (
                <li
                  key={teamId}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${
                    teamId === myTeamId ? 'bg-sky-500/15 ring-1 ring-sky-400/40' : direct || provisional.direct.has(teamId) ? 'bg-emerald-500/10' : po || provisional.po.has(teamId) ? 'bg-amber-500/10' : 'bg-white/5'
                  }`}
                >
                  <span className="w-4 shrink-0 text-center text-[11px] text-gray-500 tabular-nums">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1.5">
                      <NationLabel teamId={teamId} />
                      {teamId === myTeamId && <span className="rounded bg-sky-500/25 px-1 text-[9px] font-bold text-sky-200">내 팀</span>}
                      {isSeedAdvanced(teamId) && <span className="rounded bg-sky-500/25 px-1 text-[9px] font-bold text-sky-200">시드 자동진출</span>}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400 tabular-nums">
                      <span>{s.played}경기</span>
                      <span className="font-bold text-white">{s.points}점</span>
                      <span>{gd > 0 ? `+${gd}` : gd}</span>
                    </div>
                    {chainKeys.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums">
                        {chainKeys.map((k) => (
                          <span key={k} className={k === QUALIFY_KEY ? 'font-bold text-sky-300' : 'text-amber-300'}>
                            {shortStageLabel(k)} {stagePctFor(teamId, k).toFixed(0)}%
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <ResultBadge full={full} direct={direct} po={po} provDirect={provisional.direct.has(teamId)} provPo={provisional.po.has(teamId)} />
                </li>
              ))}
            </ul>
            <MatchList teams={groupTeams} matches={shownMatches} onSelectMatch={onSelectMatch} />
          </div>
          )
        })}
      </div>
      )}
      <p className="mt-3 text-[11px] text-gray-500">
        {full
          ? single
            ? '※ 상위권 직행, 다음 순위 대륙간 PO로 결정됩니다.'
            : '※ 조 순위는 조별 성적, 직행/PO 여부는 전체 대륙 순위(조 1위 우선 → 최고 2위 …)로 결정됩니다.'
          : r.groupLabels
            ? '※ 진행 중 — 위 차수 탭으로 각 라운드를 전환하고, 라운드를 넘겨 순위 변화를 지켜보세요. 직행/PO는 전체 라운드 종료 후 확정됩니다.'
            : '※ 진행 중 — 점선 배지는 현재 순위 기준 잠정 진출 상황(확정 아님)입니다. 라운드를 넘기면 실시간으로 바뀝니다.'}
      </p>
    </GlassCard>
  )
}

/** 지역예선 화면 (Q3/Q4). 6개 대륙 예선 + 대륙간 PO + 본선 48 확정 + 본선 조추첨 연결. */
export function QualificationStage({ onStartFinals }: { onStartFinals?: () => void }) {
  const seed = useQualificationStore((s) => s.seed)
  const result = useQualificationStore((s) => s.result)
  const simulate = useQualificationStore((s) => s.simulate)
  const probabilities = useQualificationStore((s) => s.probabilities)
  const probLoading = useQualificationStore((s) => s.probLoading)
  const computeProbabilities = useQualificationStore((s) => s.computeProbabilities)
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const soundEnabled = useSoundStore((s) => s.enabled)
  const revealed = useQualificationStore((s) => s.revealed)
  // 커리어 모드: 현재 대회 연도·개최국, 방금 끝난 본선(우승팀)이면 "다음 대회로" 진행 가능.
  const editionYear = useCareerStore((s) => s.year)
  const editionIndex = useCareerStore((s) => s.editionIndex)
  const hostIds = useCareerStore((s) => s.hostIds)
  const finalsComplete = useProgressStore((s) => s.phase === 'complete')
  const champion = useProgressStore((s) => s.champion)
  const [seedInput, setSeedInput] = useState('')
  // 내 팀이 지정돼 있으면 그 팀의 대륙을 기본 선택한다 (E1).
  const [confed, setConfed] = useState<Confederation>(
    () => (myTeamId && ALL_NATIONS_BY_ID[myTeamId]?.confederation) || 'UEFA',
  )
  const [selMatch, setSelMatch] = useState<MatchResult | null>(null)

  const drama = useMemo(() => (result ? extractQualDrama(result) : null), [result])
  // 포트 미리보기·조추첨에 쓸 "현재 FIFA 점수"(이월 + 이번 예선 반영). 최신 랭킹이 포트에 반영되게 한다.
  const careerRankingBase = useCareerStore((s) => s.rankingBase)
  const potPoints = useMemo(() => {
    if (!result) return undefined
    const carried = Object.keys(careerRankingBase).length > 0 ? careerRankingBase : undefined
    return editionEndRankingPoints(result, { groupMatches: [], knockoutMatches: [] }, carried)
  }, [result, careerRankingBase])
  // 예선이 전부 끝났는지(부분 진행이면 최종 결과 카드는 스포일러 방지로 숨긴다).
  const fullyRevealed = result ? !isPartialProgress(result, revealed) : false

  // 내 팀 본선 진출 순간 효과음·햅틱 (E2). 예선을 끝까지 봐야(스포일러 방지) 결과당 한 번만 재생.
  const playedFor = useRef<AllQualificationResult | null>(null)
  useEffect(() => {
    if (!result) {
      playedFor.current = null
      return
    }
    if (result === playedFor.current) return
    if (fullyRevealed && myTeamId && soundEnabled && result.qualified48.includes(myTeamId)) {
      playedFor.current = result
      playVictory()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, fullyRevealed, myTeamId, soundEnabled])

  // 오늘의 예선 시드 (E4 데일리 챌린지): 같은 날이면 전 세계가 같은 예선을 돌린다.
  const todaySeed = useMemo(() => `DAILY-${new Date().toISOString().slice(0, 10)}`, [])

  // 대륙 탭 키보드 이동 (I3): ←/→(또는 ↑/↓)로 대륙 전환, Home/End로 처음/끝.
  const onConfedKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const idx = CONFEDS.indexOf(confed)
    let next = idx
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % CONFEDS.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + CONFEDS.length) % CONFEDS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = CONFEDS.length - 1
    else return
    e.preventDefault()
    setConfed(CONFEDS[next])
  }

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">
          🌍 {editionYear} 월드컵 지역예선
          {editionIndex > 0 && <span className="ml-1.5 text-[11px] font-normal text-amber-300">· 커리어 {editionIndex + 1}번째 대회</span>}
        </p>
        <p className="mb-2 text-[11px] text-sky-300">
          🏟️ 개최국:{' '}
          {hostIds.map((id, i) => (
            <span key={id}>
              {i > 0 && ' · '}
              {ALL_NATIONS_BY_ID[id]?.nameKo ?? id}
            </span>
          ))}
        </p>
        <p className="mb-4 text-xs text-gray-400">
          6개 대륙 예선 + 대륙간 플레이오프를 시뮬레이션해 <strong className="text-emerald-300">본선 48개국</strong>을 가립니다.
        </p>
        {finalsComplete && (
          <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
            <p className="text-xs text-amber-200">
              🏆 {champion ? `${ALL_NATIONS_BY_ID[champion]?.nameKo ?? champion} 우승으로 ` : ''}
              {editionYear} 대회가 끝났습니다. 다음 대회로 흐름을 이어가면 개최국이 새로 선정되고, 이번 대회 성적이 각 팀의 전력에 반영됩니다.
            </p>
            <GlassButton
              className="mt-2"
              onClick={() => advanceToNextEdition()}
              title="다음 대회 개최국을 새로 선정하고, 이번 성적을 반영해 새 예선을 시작합니다"
            >
              🔜 다음 대회로 →
            </GlassButton>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <input
            type="text"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            placeholder="시드 (선택)"
            aria-label="예선 시드"
            className="w-36 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-emerald-400/50 focus:outline-none"
          />
          <GlassButton onClick={() => simulate(seedInput)} title="예선을 시작하면 첫 경기일부터 하루씩 진행합니다">
            ⚽ 지역예선 시작
          </GlassButton>
          <GlassButton
            variant="ghost"
            onClick={() => {
              setSeedInput(todaySeed)
              simulate(todaySeed)
            }}
            title="오늘 날짜 시드로 전 세계가 같은 예선을 돌립니다"
          >
            🗓️ 오늘의 예선
          </GlassButton>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          시작하면 <strong className="text-gray-300">첫 경기일</strong>부터 진행됩니다. 아래 <strong className="text-gray-300">📅 일별 진행</strong>에서
          <strong className="text-emerald-300"> 다음 경기일 ▶</strong>로 하루씩 넘기며 관전하세요(⏭ 전체로 끝까지 건너뛸 수 있습니다).
        </p>
        {seed && <p className="mt-2 text-[11px] text-gray-500">예선 시드: <span className="font-mono text-emerald-300">{seed}</span>{seed === todaySeed && <span className="ml-1 text-amber-300">· 오늘의 챌린지</span>}</p>}
      </GlassCard>

      {!result ? (
        <GlassCard className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-gray-400">
            먼저 지역예선을 진행해 본선 진출 48개국을 가립니다. 예선을 마쳐야 조추첨으로 넘어갈 수 있어요.
            시작하면 <strong className="text-gray-300">첫 경기일부터 하루씩</strong> 진행됩니다.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <GlassButton onClick={() => simulate(seedInput)}>⚽ 예선 시작 (하루씩 진행)</GlassButton>
          </div>
        </GlassCard>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="tablist"
              aria-label="대륙 선택 (좌우 화살표로 이동)"
              onKeyDown={onConfedKey}
              className="flex flex-wrap gap-1.5"
            >
              {CONFEDS.map((c) => {
                const cr = result.byConfederation[c]
                const directN = cr?.qualified.length ?? 0
                const poN = cr?.playoff.length ?? 0
                return (
                  <button
                    key={c}
                    role="tab"
                    onClick={() => setConfed(c)}
                    aria-selected={confed === c}
                    tabIndex={confed === c ? 0 : -1}
                    aria-label={`${CONFEDERATION_LABEL_KO[c]} — 직행 ${directN}${poN ? `, 플레이오프 ${poN}` : ''}`}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      confed === c ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/5 text-gray-400 hover:text-white'
                    }`}
                  >
                    <span>{CONFEDERATION_LABEL_KO[c]}</span>
                    <span className="flex items-center gap-1" aria-hidden>
                      <span className="rounded bg-emerald-500/20 px-1 text-[9px] font-bold tabular-nums text-emerald-300">
                        {directN}
                      </span>
                      {poN > 0 && (
                        <span className="rounded bg-amber-500/20 px-1 text-[9px] font-bold tabular-nums text-amber-300">
                          PO{poN}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
            <GlassButton
              variant="ghost"
              onClick={computeProbabilities}
              disabled={probLoading}
              title="본선 진출 확률과 예선 단계별(차수별) 진출 확률을 함께 계산합니다"
            >
              {probLoading ? '진출 확률 계산 중…' : probabilities ? '🔄 진출 확률 재계산' : '📊 진출 확률 (단계별 포함)'}
            </GlassButton>
          </div>

          {myTeamId && (
            <MyTeamQualBanner
              teamId={myTeamId}
              qualified48={result.qualified48}
              hosts={result.hosts}
              probability={probabilities ? probabilities[myTeamId] : undefined}
              fullyRevealed={fullyRevealed}
            />
          )}

          {probabilities && (
            <p className="-mt-2 text-[10px] text-gray-500">
              {isPartialProgress(result, revealed) ? (
                <span className="text-amber-300">※ 진행 중 — 현재까지 치른 경기 결과를 고정하고 남은 경기만 시뮬레이션한 <strong>조건부 확률</strong>입니다(갱신된 전력 반영). </span>
              ) : (
                '※ '
              )}
              진출 확률은 {PROB_ITERATIONS}회 시뮬레이션 표본 추정치이며 ±오차범위(95% 신뢰구간)를 갖습니다.
            </p>
          )}

          <QualDailyProgress result={result} onSelectMatch={setSelMatch} confed={confed} />

          <QualLiveRanking result={result} myTeamId={myTeamId} />

          {fullyRevealed && <QualOverviewCard result={result} onSelect={setConfed} />}

          <ConfederationStandings confed={confed} onSelectMatch={setSelMatch} myTeamId={myTeamId} />

          {!fullyRevealed && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              🗓️ 예선 진행 중 — 위 <strong>📅 일별 진행</strong>에서 <strong>다음 경기일 ▶</strong>로 날짜를 넘기며 관전하세요.
              최종 순위·대륙간 PO·본선 진출국·통계는 예선을 모두 마치면(⏭ 끝) 표시됩니다.
            </p>
          )}

          {fullyRevealed && (
          <>
          <GlassCard className="p-4">
            <h3 className="mb-3 text-sm font-bold text-amber-300">🎯 대륙간 플레이오프 (6팀 → 2장)</h3>
            {result.interConfed.matches.length > 0 ? (
              <InterConfedBracket result={result.interConfed} />
            ) : (
              <div className="mb-3 flex flex-wrap gap-2">
                {result.interConfed.participants.map((id) => (
                  <span
                    key={id}
                    className={`rounded-lg px-2 py-1 text-xs ${
                      result.interConfed.winners.includes(id) ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/5 text-gray-400'
                    }`}
                  >
                    <NationLabel teamId={id} />
                    {result.interConfed.winners.includes(id) && ' ✅'}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-gray-500">
              최종 진출:{' '}
              {result.interConfed.winners.map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join(', ')}
            </p>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-emerald-300">
                🏆 본선 진출 48개국 <span className="text-gray-500">({result.qualified48.length})</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <QualShareButton seed={seed} result={result} myTeamId={myTeamId} />
                <GlassButton
                  onClick={() => {
                    // 예선 폼(Elo 변동)을 본선 컨디션에 반영 → 우승 확률이 예선 실황을 반영.
                    // 조추첨을 즉시 끝내지 않고 "준비"만 해, 조추첨 화면에서 순서대로 진행하게 한다.
                    prepareFinalsDrawFromQualification(result.qualified48, formOffsetsFromResults(result))
                    onStartFinals?.()
                  }}
                >
                  🎲 본선 조추첨으로 이동 →
                </GlassButton>
              </div>
            </div>
            {/* 대륙별로 묶어 표시 (H4) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CONFEDS.map((c) => {
                const members = result.qualified48.filter((id) => ALL_NATIONS_BY_ID[id]?.confederation === c)
                if (members.length === 0) return null
                return (
                  <div key={c}>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-gray-300">
                      {CONFEDERATION_LABEL_KO[c]}
                      <span className="rounded bg-white/10 px-1 text-[9px] tabular-nums text-gray-400">{members.length}</span>
                    </p>
                    <div className="space-y-1">
                      {members.map((id) => (
                        <div key={id} className="flex items-center gap-1.5 text-xs">
                          <NationLabel teamId={id} />
                          {result.hosts.includes(id) && <span className="text-[9px] text-sky-300">개최</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <details open className="group mt-4 border-t border-white/10 pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-gray-300">
                <span>🎩 본선 포트 배정 확인 (랭킹 기준)</span>
                <span className="text-gray-500 transition-transform group-open:rotate-180">▾</span>
              </summary>
              {(() => {
                const pots = computePots(result.qualified48, undefined, potPoints)
                const potHostIds = result.hosts
                const potList: [string, string[]][] = [
                  ['포트 1 (개최국 + 최상위)', [...potHostIds, ...pots[1]]],
                  ['포트 2', pots[2]],
                  ['포트 3', pots[3]],
                  ['포트 4', pots[4]],
                ]
                return (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {potList.map(([label, ids]) => (
                      <div key={label}>
                        <p className="mb-1.5 text-[11px] font-bold text-emerald-300">{label}</p>
                        <div className="space-y-0.5">
                          {ids.map((id) => (
                            <div key={id} className="flex items-center gap-1.5 text-[11px]">
                              <NationLabel teamId={id} />
                              {potHostIds.includes(id) && <span className="text-[9px] text-sky-300">개최</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </details>
          </GlassCard>
          </>
          )}

          {fullyRevealed && <QualStatsCard result={result} />}

          {fullyRevealed && <QualHighlightsCard result={result} onSelectMatch={setSelMatch} />}

          {fullyRevealed && <QualUpsetArticleCard result={result} />}

          {probabilities && <QualLuckCard result={result} probabilities={probabilities} />}

          {myTeamId && ALL_NATIONS_BY_ID[myTeamId] && !result.hosts.includes(myTeamId) && (
            <QualWhatIfCard teamId={myTeamId} seedBase={seed ?? 'WHATIF'} />
          )}

          <QualDifficultyCard />

          {fullyRevealed && drama && (drama.surpriseQualifiers.length > 0 || drama.shockEliminations.length > 0) && (
            <GlassCard className="p-4">
              <h3 className="mb-3 text-sm font-bold text-amber-300">🎭 예선 이변</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-[11px] font-bold text-emerald-300">🐎 깜짝 본선행 (랭킹 낮은데 진출)</p>
                  <div className="space-y-1">
                    {drama.surpriseQualifiers.map((d) => (
                      <div key={d.teamId} className="flex items-center justify-between text-xs">
                        <NationLabel teamId={d.teamId} />
                        <span className="text-[10px] text-gray-500">FIFA {d.rank}위</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-bold text-red-300">💥 충격 탈락 (랭킹 높은데 탈락)</p>
                  <div className="space-y-1">
                    {drama.shockEliminations.map((d) => (
                      <div key={d.teamId} className="flex items-center justify-between text-xs">
                        <NationLabel teamId={d.teamId} />
                        <span className="text-[10px] text-gray-500">FIFA {d.rank}위</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </GlassCard>
          )}

          <GlassCard className="p-4">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-gray-200">
                <span>📖 예선 규정 도움말</span>
                <span className="text-xs text-gray-500 transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-gray-400">
                <p>
                  <strong className="text-emerald-300">슬롯 배분:</strong> UEFA 16 · CAF 9 · AFC 8 · CONMEBOL 6 ·
                  CONCACAF 6(개최 3국 포함) · OFC 1 = 46 직행. 여기에 대륙간 플레이오프 2장을 더해 총 48개국.
                </p>
                <p>
                  <strong className="text-emerald-300">개최국:</strong>{' '}
                  {getCurrentHostIds().map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join('·')}는 예선 없이 자동
                  진출합니다. (커리어 모드에서는 대회마다 개최국이 새로 선정됩니다.)
                </p>
                <p>
                  <strong className="text-emerald-300">대륙간 플레이오프:</strong> 각 대륙의 PO행 팀(총 6팀)이
                  시드 브래킷으로 맞붙어 2장을 가립니다.
                </p>
                <p>
                  <strong className="text-emerald-300">랭킹 기준:</strong> 팀 전력·시드는 FIFA 랭킹을
                  근사한 값(2026 예선 시점 기준)이며, 정확한 최신 공식 랭킹과 다를 수 있습니다.
                </p>
                <p>세부 포맷은 시뮬레이션에 맞게 근사했으며, 조추첨 이후처럼 예선 결과도 실제 대회와 무관한 가상 시뮬레이션입니다.</p>
              </div>
            </details>
          </GlassCard>
        </>
      )}

      {selMatch && <QualMatchModal match={selMatch} onClose={() => setSelMatch(null)} />}
    </div>
  )
}
