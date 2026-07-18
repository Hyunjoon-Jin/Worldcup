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
import { useDrawStore } from '../../store/useDrawStore'
import { computeStandings, rankGroupTeams } from '../../engine/tiebreakers'
import { rankAcrossGroups } from '../../engine/qualification/generic'
import { extractQualDrama } from '../../engine/qualification/drama'
import { computeQualStats, computeConfedDifficulty, computeLuckAnalysis, probMarginPct, computeQualHighlights, type QualTeamStat } from '../../engine/qualification/stats'
import { pickQualUpset } from '../../engine/qualification/upset'
import { runWhatIfScenarios, type WhatIfScenario } from '../../engine/qualification/whatif'
import { buildQualCalendar } from '../../engine/qualification/calendar'
import { QUAL_RULES, INTER_CONFED_RULE, deriveQualStages, stageStatus, stageNameAt, isKnockoutGroup } from '../../engine/qualification/rules'
import { computeLiveRanking, formOffsetsFromResults, editionEndRankingPoints, type LiveRankRow } from '../../engine/qualification/ranking'
import { collectPlayedByConfed, flattenPlayed, isPartialProgress } from '../../engine/qualification/conditional'
import { generateUpsetArticle } from '../../engine/upsetArticle'
import { PROB_ITERATIONS } from '../../store/useQualificationStore'
import type { AllQualificationResult } from '../../engine/qualification'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { CONFEDERATION_LABEL_KO } from '../../data/teams'
import { useLiveRankLookup } from '../ranking/useLiveFifaRanking'
import { computePots } from '../../engine/drawEngine'
import { getCurrentHostIds } from '../../engine/hostContext'
import { QualMatchModal } from './QualMatchModal'
import { QualDrawReveal } from './QualDrawReveal'
import type { Confederation } from '../../types/team'
import type { MatchResult } from '../../types/match'
import type { QualificationResult, QualMatch } from '../../types/qualification'
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
      <summary className="cursor-pointer list-none rounded bg-white/5 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/10">
        ⚽ 이 조 경기 실황·전적 보기 ({groupMatches.length}경기) ▾
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
      <span className="whitespace-nowrap font-medium text-gray-100">{nation.nameKo}</span>
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

/**
 * 녹아웃(브래킷/2연전) 스테이지 표시 — 순위표 대신 대진표로 그린다. 조 2위 미니토너먼트·UEFA PO 경로·
 * OFC 녹아웃(준결승→결승) 및 AFC 5차(홈&어웨이 2연전) 같은 단판/합산 토너먼트를 올바른 형태로 보여준다.
 */
function KnockoutStageView({
  groupLabel,
  matches,
  qSet,
  pSet,
  myTeamId,
  onSelectMatch,
}: {
  groupLabel: string
  matches: QualMatch[]
  qSet: Set<string>
  pSet: Set<string>
  myTeamId: string | null
  onSelectMatch: (m: MatchResult) => void
}) {
  if (matches.length === 0) {
    return <p className="rounded-lg bg-white/5 px-3 py-4 text-center text-[11px] text-gray-500">이 녹아웃은 아직 진행되지 않았습니다.</p>
  }
  const teams = new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))
  const mds = [...new Set(matches.map((m) => m.matchday))].sort((a, b) => a - b)
  const twoLeg = teams.size === 2 && mds.length >= 2 // 같은 두 팀의 홈&어웨이 2연전(합산)
  const nameKo = (id: string) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id
  const resultBadge = (id: string) =>
    qSet.has(id) ? (
      <span className="ml-1 rounded bg-emerald-500/20 px-1 text-[9px] font-bold text-emerald-300">직행</span>
    ) : pSet.has(id) ? (
      <span className="ml-1 rounded bg-amber-500/20 px-1 text-[9px] font-bold text-amber-300">PO</span>
    ) : null

  const MatchRow = ({ m, winner }: { m: QualMatch; winner: string | null }) => (
    <button
      type="button"
      onClick={() => onSelectMatch(m)}
      className="flex w-full items-center gap-2 rounded bg-white/5 px-2 py-1.5 text-[11px] hover:bg-white/10"
    >
      <span className={`min-w-0 flex-1 truncate text-right ${winner === m.homeTeamId ? 'font-bold text-emerald-200' : 'text-gray-400'}`}>
        {m.homeTeamId === myTeamId && '⭐'}
        {nameKo(m.homeTeamId)}
      </span>
      <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-bold tabular-nums text-white">
        {m.homeGoals}-{m.awayGoals}
      </span>
      <span className={`min-w-0 flex-1 truncate ${winner === m.awayTeamId ? 'font-bold text-emerald-200' : 'text-gray-400'}`}>
        {nameKo(m.awayTeamId)}
        {m.awayTeamId === myTeamId && '⭐'}
      </span>
    </button>
  )

  if (twoLeg) {
    const [a, b] = [...teams]
    const agg: Record<string, number> = { [a]: 0, [b]: 0 }
    for (const m of matches) {
      agg[m.homeTeamId] += m.homeGoals
      agg[m.awayTeamId] += m.awayGoals
    }
    // 합산 승자 = 골 합계 우위, 동률이면 진출(qSet/pSet)에 있는 팀.
    const winner = agg[a] !== agg[b] ? (agg[a] > agg[b] ? a : b) : qSet.has(a) || pSet.has(a) ? a : b
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-violet-300">{groupLabel} · 홈&어웨이 2연전(합산)</p>
        {mds.map((md, i) => {
          const m = matches.find((x) => x.matchday === md)!
          return (
            <div key={md} className="flex items-center gap-1.5">
              <span className="shrink-0 text-[9px] text-gray-500">{i + 1}차전</span>
              <div className="flex-1">
                <MatchRow m={m} winner={null} />
              </div>
            </div>
          )
        })}
        <div className="flex items-center justify-center gap-2 rounded bg-emerald-500/10 px-2 py-1 text-[11px]">
          <span className="text-gray-400">합산</span>
          <span className={winner === a ? 'font-bold text-emerald-200' : 'text-gray-400'}>{nameKo(a)} {agg[a]}</span>
          <span className="text-gray-500">-</span>
          <span className={winner === b ? 'font-bold text-emerald-200' : 'text-gray-400'}>{agg[b]} {nameKo(b)}</span>
          {resultBadge(winner)}
        </div>
      </div>
    )
  }

  // 브래킷(단판 토너먼트): 라운드(matchday) 순. 라운드 이름은 그 라운드의 경기 수로 판정한다
  // (결승 1 · 준결승 2 · 8강 4 …) → 일부만 공개된 중간 상태에서도 라벨이 어긋나지 않는다.
  const roundNameByCount = (n: number): string =>
    ({ 1: '결승', 2: '준결승', 4: '8강', 8: '16강', 16: '32강' })[n] ?? `${n * 2}강`
  const matchWinner = (m: QualMatch) => (m.homeGoals >= m.awayGoals ? m.homeTeamId : m.awayTeamId)
  return (
    <div className="space-y-2">
      {mds.map((md) => {
        const roundMatches = matches.filter((m) => m.matchday === md)
        const roundName = roundNameByCount(roundMatches.length)
        const isFinal = roundMatches.length === 1
        return (
          <div key={md}>
            <p className="mb-1 text-[10px] font-bold text-violet-300">{roundName}</p>
            <div className="space-y-1">
              {roundMatches.map((m, j) => {
                const w = matchWinner(m)
                const drawn = m.homeGoals === m.awayGoals
                return (
                  <div key={j} className="flex items-center gap-1.5">
                    <div className="flex-1">
                      <MatchRow m={m} winner={w} />
                    </div>
                    {drawn && <span className="shrink-0 text-[9px] text-gray-500" title="무승부 시 상위 시드 진출">시드</span>}
                    {isFinal && resultBadge(w)}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
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
  const played = useMemo(() => flattenPlayed(collectPlayedByConfed(result, revealed)), [result, revealed])
  const ranking = useMemo(() => computeLiveRanking(result, played, undefined, carried), [result, played, carried])

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

/** 특정 대륙에서 matchday에 시작하는 '포트 조추첨 차수'의 조추첨 데이터. 없으면 null. */
function potDrawDataForStageStart(r: QualificationResult, matchday: number) {
  const stage = deriveQualStages(r).find((s) => s.startMd === matchday)
  if (!stage) return null
  const sizes = stage.groupIndices.map((gi) => r.groups[gi]?.length ?? 0)
  const knockout = stage.groupIndices.every((gi) => isKnockoutGroup(r, gi))
  if (knockout || stage.groupIndices.length < 2 || (sizes[0] ?? 0) < 3 || !sizes.every((n) => n === sizes[0])) return null
  const groupsByPot = stage.groupIndices.map((gi) =>
    [...(r.groups[gi] ?? [])].sort((a, b) => ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox),
  )
  const groupLabels = stage.groupIndices.map((gi, i) => r.groupLabels?.[gi] ?? `${i + 1}조`)
  return { stageName: stage.name, groupsByPot, groupLabels, potCount: sizes[0] }
}

/** 일별 진행 (B2). 경기 일정(캘린더)을 하루씩 진행하며, 차수 사이에서는 조추첨을 먼저 보여준다. */
function QualDailyProgress({ result, onSelectMatch, confed }: { result: AllQualificationResult; onSelectMatch: (m: MatchResult) => void; confed: Confederation }) {
  const wcYear = useCareerStore((s) => s.year)
  const calendar = useMemo(() => buildQualCalendar(result, wcYear), [result, wcYear])
  const stages = useMemo(() => deriveQualStages(result.byConfederation[confed]), [result, confed])
  const revealed = useQualificationStore((s) => s.revealed)
  const friendlies = useQualificationStore((s) => s.friendlies)
  const drawPending = useQualificationStore((s) => s.drawPending)
  const advanceQual = useQualificationStore((s) => s.advanceQual)
  const advanceQualToEnd = useQualificationStore((s) => s.advanceQualToEnd)

  const r = result.byConfederation[confed]
  if (!r || calendar.length === 0) return null
  const total = r.matchdays
  const totalWindows = calendar.length
  const globalWindow = Math.max(
    1,
    Math.min(totalWindows, Math.max(0, ...Object.keys(result.byConfederation).map((c) => revealed[c] ?? 0))),
  )
  const round = Math.min(globalWindow, total)
  const date = calendar[globalWindow - 1]
  const matches = r.matches.filter((m) => m.matchday === round)
  const winFriendlies = friendlies.filter(
    (f) =>
      f.matchday === globalWindow &&
      (ALL_NATIONS_BY_ID[f.homeTeamId]?.confederation === confed || ALL_NATIONS_BY_ID[f.awayTeamId]?.confederation === confed),
  )
  const stageName = stageNameAt(stages, round)
  const atEnd = globalWindow >= totalWindows && drawPending == null

  // 조추첨 단계: 이 경기일(drawPending)에 조추첨 차수가 시작되는 모든 대륙의 조추첨을 보여준다.
  const pendingDraws =
    drawPending != null
      ? Object.entries(result.byConfederation)
          .map(([c, cr]) => ({ confed: c as Confederation, draw: potDrawDataForStageStart(cr, drawPending) }))
          .filter((x): x is { confed: Confederation; draw: NonNullable<ReturnType<typeof potDrawDataForStageStart>> } => x.draw != null)
      : []

  const statusText =
    drawPending != null
      ? `🎬 조추첨 진행 — ${drawPending}경기일 시작 전`
      : atEnd
        ? `✅ 지역예선 종료 — 경기일 ${totalWindows} / ${totalWindows}`
        : `🌍 지역예선 진행 중 — 경기일 ${globalWindow} / ${totalWindows}`
  const progressPct = Math.round((globalWindow / totalWindows) * 100)
  const nextLabel = !atEnd && drawPending == null ? calendar[globalWindow]?.label : undefined

  return (
    <GlassCard strong className="p-5">
      {/* 상단 진행 상태 + 진행바 (본선 '일정 진행' 탭과 통일된 UX) */}
      <p className="mb-2 text-center text-sm font-semibold text-white">{statusText}</p>
      <div className="mx-auto mb-1 h-2 max-w-md overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-[width]" style={{ width: `${progressPct}%` }} />
      </div>
      <p className="mb-3 text-center text-[10px] text-gray-500">
        {drawPending != null ? '조추첨을 진행한 뒤 아래 버튼으로 이 경기일을 진행하세요.' : '‘다음 경기일’이 6개 대륙을 함께 진행합니다. 차수 사이에서는 조추첨을 먼저 보여줍니다.'}
      </p>

      {/* 진행 컨트롤 (중앙 정렬, 본선 탭과 동일한 버튼 구성) */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {drawPending != null ? (
            <GlassButton onClick={advanceQual}>🎬 조추첨 완료 · {drawPending}경기일 진행 →</GlassButton>
          ) : atEnd ? (
            // 예선이 끝났으면 자동진행 대신 '본선진출국 확인하기'를 띄우고, 누르면 진출국·조추첨 구역으로 스크롤.
            <GlassButton
              onClick={() => document.getElementById('qual-finals-field')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              🏆 본선진출국 확인하기 →
            </GlassButton>
          ) : (
            <>
              <GlassButton onClick={advanceQual}>▶ 다음 경기일 진행</GlassButton>
              <GlassButton variant="ghost" onClick={advanceQualToEnd}>⏭ 예선 끝까지 자동 진행</GlassButton>
            </>
          )}
        </div>
        {nextLabel && <p className="text-[11px] text-gray-500">다음 경기일: {nextLabel}</p>}
      </div>

      {/* 본문: 조추첨 단계 또는 그날 경기 */}
      <div className="mt-4">
        {drawPending != null ? (
          pendingDraws.length === 0 ? (
            <p className="rounded-lg bg-white/5 px-3 py-4 text-center text-[11px] text-gray-500">이 경기일 조추첨 정보가 없습니다. ‘조추첨 완료’로 진행하세요.</p>
          ) : (
            <div className="space-y-3">
              {pendingDraws.map(({ confed: c, draw }) => (
                <QualDrawReveal key={c} confedLabel={CONFEDERATION_LABEL_KO[c]} stageName={draw.stageName} groupsByPot={draw.groupsByPot} groupLabels={draw.groupLabels} potCount={draw.potCount} />
              ))}
            </div>
          )
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
              <span className="text-[11px] font-bold text-gray-300">
                {date?.label ?? ''}
                {stageName && <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">{CONFEDERATION_LABEL_KO[confed]} {stageName}</span>}
              </span>
              <span className="text-[10px] text-gray-500">{CONFEDERATION_LABEL_KO[confed]} · {matches.length}경기</span>
            </div>
            <div className="max-h-72 overflow-y-auto pr-1">
              {matches.length === 0 ? (
                <p className="rounded-lg bg-white/5 px-3 py-4 text-center text-[11px] text-gray-500">
                  {round}라운드에는 {CONFEDERATION_LABEL_KO[confed]} 예정 경기가 없습니다
                  {round >= total ? ' (예선 종료).' : ' — 대륙 탭을 바꾸면 다른 대륙 경기를 볼 수 있습니다.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {matches.map((m, i) => (
                    <button key={i} onClick={() => onSelectMatch(m)} className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1 text-[11px] hover:bg-white/10">
                      <span className="min-w-0 flex-1 truncate text-right text-gray-300">{ALL_NATIONS_BY_ID[m.homeTeamId]?.nameKo ?? m.homeTeamId}</span>
                      <span className="shrink-0 font-bold tabular-nums text-white">{m.homeGoals}-{m.awayGoals}</span>
                      <span className="min-w-0 flex-1 truncate text-gray-300">{ALL_NATIONS_BY_ID[m.awayTeamId]?.nameKo ?? m.awayTeamId}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {winFriendlies.length > 0 && (
              <div className="mt-2 border-t border-white/10 pt-2">
                <p className="mb-1 text-[10px] font-bold text-sky-300">🤝 친선전(평가전) · {winFriendlies.length}경기</p>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {winFriendlies.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded bg-sky-500/[0.06] px-2 py-1 text-[11px]">
                      <span className="min-w-0 flex-1 truncate text-right text-gray-400">{ALL_NATIONS_BY_ID[f.homeTeamId]?.nameKo ?? f.homeTeamId}</span>
                      <span className="shrink-0 font-bold tabular-nums text-gray-200">{f.homeGoals}-{f.awayGoals}</span>
                      <span className="min-w-0 flex-1 truncate text-gray-400">{ALL_NATIONS_BY_ID[f.awayTeamId]?.nameKo ?? f.awayTeamId}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
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
  const liveRank = useLiveRankLookup()
  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-sm font-bold text-gray-200">🗺️ 대륙 예선 개요</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {CONFEDS.map((c) => {
          const r = result.byConfederation[c]
          if (!r) return null
          const participantIds = [...new Set(r.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))]
          const participants = participantIds.length
          // 대표국가는 '현재 실시간 FIFA 랭킹'이 가장 높은(순위 숫자가 작은) 참가국으로 정한다.
          const topQualifier = participantIds.reduce<string | null>((best, id) => {
            if (best == null) return id
            const ri = liveRank(id, ALL_NATIONS_BY_ID[id]?.fifaRankApprox ?? 999)
            const rb = liveRank(best, ALL_NATIONS_BY_ID[best]?.fifaRankApprox ?? 999)
            return ri < rb ? id : best
          }, null)
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
    const lines = ['🌍 월드컵 시뮬레이터 — 지역예선', `예선 시드: ${seed ?? '(무작위)'}`, '본선 진출 48개국 확정!']
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
  const liveRank = useLiveRankLookup()
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
          내 팀 · {CONFEDERATION_LABEL_KO[nation.confederation]} · FIFA {liveRank(teamId, nation.fifaRankApprox)}위
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

// 진출 확정/완전 탈락 판정. 화면에 표시되는 '본선 X%'(정수 반올림)와 일치시켜, 100%로 표시되면 '진출',
// 0%로 표시되면(대륙간 PO도 0%) '탈락'으로 본다.
function isQualClinched(qualifyPct: number): boolean {
  return Math.round(qualifyPct) >= 100
}
function isQualEliminated(qualifyPct: number, poPct?: number | null): boolean {
  return Math.round(qualifyPct) <= 0 && Math.round(poPct ?? 0) <= 0
}

/** 직행/PO/탈락 상태 배지 (색+아이콘+텍스트 병행, I4). 진행 중이면 '—'. */
function ResultBadge({
  full,
  direct,
  po,
  provDirect,
  provPo,
  qualifyPct,
  poPct,
}: {
  full: boolean
  direct: boolean
  po: boolean
  /** 진행 중 잠정 진출 상황(현재 순위 기준) */
  provDirect?: boolean
  provPo?: boolean
  /** 진행 중 '본선 진출' 확률(%). 확률이 계산돼 있을 때만 값이 들어온다. */
  qualifyPct?: number | null
  /** 진행 중 '대륙간 PO' 확률(%). 탈락(완전 탈락) 판정에 쓴다. */
  poPct?: number | null
}) {
  if (!full) {
    // 진출/탈락은 본선 진출 확정/완전 탈락 기준, 위기는 '본선 진출 확률 50% 미만' 기준으로 판정한다.
    // 판정 기준을 화면에 표시되는 반올림 값(본선 X%)과 일치시켜, '본선 100%'인데 배지가 안 뜨는 불일치를 없앤다.
    if (qualifyPct != null) {
      if (isQualClinched(qualifyPct)) return <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300" title={`본선 진출 확률 ${qualifyPct.toFixed(1)}%`}>✅ 진출</span>
      if (isQualEliminated(qualifyPct, poPct)) return <span className="rounded bg-gray-500/25 px-1.5 py-0.5 text-[10px] font-bold text-gray-400" title={`본선 진출 확률 ${qualifyPct.toFixed(1)}%`}>❌ 탈락</span>
      if (qualifyPct < 50) return <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300" title={`본선 진출 확률 ${qualifyPct.toFixed(1)}%`}>⚠️ 위기</span>
    }
    // 확률이 없거나 안정권(≥50%)이면 현재 순위 기준 잠정 진출 상황(점선 테두리로 '확정 아님' 표시)
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
  const qualSeed = useQualificationStore((s) => s.seed)
  // 선택된 예선 차수(스테이지) 탭. null이면 '현재 진행 중인 차수'를 따라간다. 대륙을 바꾸거나
  // 새 예선(다음 대회 등, 시드 변경)이 시작되면 리셋해, 이전 대회의 상위 차수 탭이 남아
  // 이제 막 시작한 새 예선을 'upcoming'으로 잘못 보여주지 않게 한다 (#22).
  const [selectedStageName, setSelectedStageName] = useState<string | null>(null)
  // 조추첨 애니메이션 리빌 열림 여부. 대륙/차수/시드가 바뀌면 닫는다.
  const [drawRevealOpen, setDrawRevealOpen] = useState(false)
  useEffect(() => {
    setSelectedStageName(null)
    setDrawRevealOpen(false)
  }, [confed, qualSeed])
  useEffect(() => {
    setDrawRevealOpen(false)
  }, [selectedStageName])
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
    // 진행 중 차수가 없고 직전 차수가 막 끝났으면, 다음(예정) 차수를 기본 선택해 '조추첨'을 먼저 보여준다
    // (순서: 이전 차수 → 이 차수 조추첨 → 이 차수 경기).
    stages.find(
      (s, i) => stageStatus(s, revealed) === 'upcoming' && (i === 0 || stageStatus(stages[i - 1], revealed) === 'done'),
    ) ??
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
  const INTER_PLAYOFF_KEY = '대륙간PO'
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
  const stageGroupSizes = selectedStage ? selectedStage.groupIndices.map((gi) => r.groups[gi]?.length ?? 0) : []
  const firstStageGroupSize = stageGroupSizes[0] ?? 0
  // 포트 재구성은 조 크기가 모두 같을 때만 정확하다(크기가 다르면 슬라이스가 어긋나므로 표시하지 않는다).
  const uniformGroupSizes = stageGroupSizes.length > 0 && stageGroupSizes.every((n) => n === firstStageGroupSize)
  // 녹아웃(플레이오프·2연전) 차수는 포트 조추첨이 아니므로 조추첨 포트/리빌을 표시하지 않는다.
  const selectedStageIsKnockout = !!selectedStage && selectedStage.groupIndices.every((gi) => isKnockoutGroup(r, gi))
  // 이 차수가 '포트로 조추첨하는 조별 차수'인가(균등 크기 2개 이상 조). 상태(진행/예정)와 무관하게 판정.
  const stageIsPotDraw = !!selectedStage && !selectedStageIsKnockout && stageNumGroups >= 2 && firstStageGroupSize >= 3 && uniformGroupSizes
  // 직전 차수가 끝났는지(이 차수 참가국이 확정됐는지) — 예정 차수라도 조추첨은 스포일러가 아니므로 먼저 보여줄 수 있다.
  const selIdxInStages = selectedStage ? stages.findIndex((s) => s.name === selectedStage.name) : -1
  const prevStageDone = selIdxInStages > 0 ? stageStatus(stages[selIdxInStages - 1], revealed) === 'done' : true
  const showDrawPots = !selectedStageUpcoming && useStageTabs && stageIsPotDraw
  const drawPots: string[][] = showDrawPots
    ? Array.from({ length: firstStageGroupSize }, (_, p) => stageTeamsSorted.slice(p * stageNumGroups, (p + 1) * stageNumGroups))
    : []
  // 조추첨 리빌용: 각 조 멤버를 FIFA 랭킹순(=포트 순)으로 정렬. groupsByPot[g][p] = g조의 포트 p 팀.
  const drawGroupsByPot: string[][] = stageIsPotDraw && selectedStage
    ? selectedStage.groupIndices.map((gi) =>
        [...(r.groups[gi] ?? [])].sort((a, b) => ALL_NATIONS_BY_ID[a].fifaRankApprox - ALL_NATIONS_BY_ID[b].fifaRankApprox),
      )
    : []
  const drawGroupLabels: string[] = stageIsPotDraw && selectedStage
    ? selectedStage.groupIndices.map((gi, i) => r.groupLabels?.[gi] ?? `${GROUP_LETTERS[selectedStage.groupIndices[i]] ?? i + 1}조`)
    : []
  // 예정 차수인데 직전 차수가 끝나 참가국이 확정된 조별 차수 → 경기 전에 '조추첨'을 먼저 보여준다(순서: 이전 차수 → 이 차수 조추첨 → 이 차수 경기).
  const showUpcomingDraw = selectedStageUpcoming && prevStageDone && stageIsPotDraw

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

      {/* 조추첨 애니메이션 리빌 (직접 조추첨) */}
      {showDrawPots && drawRevealOpen && (
        <QualDrawReveal
          confedLabel={CONFEDERATION_LABEL_KO[confed]}
          stageName={selectedStage?.name ?? '조별리그'}
          groupsByPot={drawGroupsByPot}
          groupLabels={drawGroupLabels}
          potCount={firstStageGroupSize}
          onClose={() => setDrawRevealOpen(false)}
        />
      )}

      {/* 이 차수 조추첨 포트(랭킹 시드) — 조가 어떻게 편성됐는지 보여준다 */}
      {showDrawPots && !drawRevealOpen && (
        <div className="mb-3">
          <button
            onClick={() => setDrawRevealOpen(true)}
            className="mb-2 w-full rounded-lg border border-violet-400/30 bg-violet-500/15 px-3 py-2 text-[11px] font-bold text-violet-100 hover:bg-violet-500/25"
          >
            🎬 {selectedStage?.name} 직접 조추첨 진행 (포트별 한 팀씩 뽑기)
          </button>
          <details className="group rounded-lg border border-violet-400/20 bg-violet-500/[0.06]">
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
        </div>
      )}

      {/* 랭킹 시드 자동진출 안내 — 이 차수에 하위 라운드 없이 자동진출한 국가가 있으면 표시 */}
      {useStageTabs && selStageIdx > 0 && !selectedStageUpcoming && stageTeamsSorted.some((id) => isSeedAdvanced(id)) && (
        <p className="mb-3 rounded-lg bg-sky-500/10 px-3 py-2 text-[10px] text-sky-200">
          🎖️ FIFA 랭킹 상위국은 하위 라운드를 건너뛰고 <strong>{selectedStage?.name}부터 자동 진출</strong>합니다
          (순위표에 <span className="rounded bg-sky-500/15 px-1 font-bold text-sky-300/80">🔹시드</span> 표시).
        </p>
      )}

      {/* 이 대륙의 진행 상태(읽기 전용). 실제 진행은 위 '📅 일별 진행'에서 전 대륙 공통으로 한다
          (개별 대륙만 되감으면 예선 '완료' 상태가 풀려 본선 진출 표시가 사라지므로, 여기서는 표시만 한다). */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-gray-300">
          라운드 <span className="text-emerald-300">{revealed}</span> / {total}
          {!full && <span className="ml-1 text-[10px] font-normal text-amber-300">진행 중</span>}
          {full && <span className="ml-1 text-[10px] font-normal text-emerald-300">완료</span>}
        </span>
        <span className="text-[10px] text-gray-500">📅 일별 진행에서 ‘다음 경기일 ▶’로 진행</span>
      </div>

      {selectedStageUpcoming ? (
        showUpcomingDraw ? (
          // 이전 차수가 끝나 참가국이 확정됨 → 경기 전에 이 차수 조추첨을 먼저 보여준다.
          <div>
            <p className="mb-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
              🎬 <strong>{selectedStage?.name} 조추첨</strong> — 이전 차수가 끝나 진출국이 확정됐습니다. 아래에서 조추첨을 진행한 뒤,
              위 <strong>📅 일별 진행</strong>에서 경기일을 넘기면 이 차수 경기가 시작됩니다.
            </p>
            <QualDrawReveal
              confedLabel={CONFEDERATION_LABEL_KO[confed]}
              stageName={selectedStage?.name ?? '조별리그'}
              groupsByPot={drawGroupsByPot}
              groupLabels={drawGroupLabels}
              potCount={firstStageGroupSize}
            />
          </div>
        ) : (
          <div className="rounded-lg bg-white/5 p-6 text-center text-xs text-gray-500">
            <p>아직 진행되지 않은 차수입니다. 이전 차수가 끝나면 이 차수 진출국이 확정됩니다.</p>
            <p className="mt-1 text-[10px]">📅 일별 진행에서 라운드를 넘겨 이 차수까지 진행해 보세요.</p>
          </div>
        )
      ) : (
      <div className={single ? '' : 'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
        {r.groups.map((finalOrder, gi) => {
          if (!visibleGroupIdx.has(gi)) return null // 선택된 차수의 조만 노출
          const groupMatches = shownMatches.filter((m) => m.group === gi)
          // 녹아웃(브래킷/2연전) 조는 순위표가 아니라 대진표로 그린다(리그 형태 오표시 방지).
          if (isKnockoutGroup(r, gi)) {
            const koLabel = r.groupLabels?.[gi] ?? '녹아웃'
            return (
              <div key={gi} className="rounded-lg border border-violet-400/15 bg-violet-500/[0.04] p-2.5">
                <p className="mb-1.5 font-display text-xs font-bold text-violet-200">🏆 {koLabel}</p>
                <KnockoutStageView
                  groupLabel={koLabel}
                  matches={groupMatches as QualMatch[]}
                  qSet={qSet}
                  pSet={pSet}
                  myTeamId={myTeamId}
                  onSelectMatch={onSelectMatch}
                />
              </div>
            )
          }
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
              // 진행 중 '본선 진출'·'대륙간 PO' 확률 — 진출/탈락/위기 배지 판정에 쓴다(위기는 본선 진출 확률 < 50%).
              // stageProbs가 계산돼 있을 때만 값이 잡히고, 아니면(null) 배지를 표시하지 않는다.
              qualifyPct: !full && stageProbs ? stagePctFor(teamId, QUALIFY_KEY) : null,
              poPct: !full && stageProbs ? stagePctFor(teamId, INTER_PLAYOFF_KEY) : null,
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
                      <th key={k} scope="col" className="w-12 py-1 text-right" title={k === QUALIFY_KEY ? '본선 진출 확률' : `${k} 도달 확률 (상위 차수에서 직행하지 못하고 이 차수로 내려올 확률 — 낮을수록 상위 차수에서 일찍 통과)`}>
                        {shortStageLabel(k)}
                      </th>
                    ))}
                    <th scope="col" className="py-1 text-right">결과</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ teamId, idx, s, gd, direct, po, qualifyPct, poPct }) => (
                    <tr
                      key={teamId}
                      className={`border-t border-white/5 ${teamId === myTeamId ? 'bg-sky-500/10' : direct || provisional.direct.has(teamId) ? 'bg-emerald-500/10' : po || provisional.po.has(teamId) ? 'bg-amber-500/10' : ''}`}
                    >
                      <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                      <th scope="row" className="whitespace-nowrap py-1.5 font-normal">
                        <span className="inline-flex items-center gap-1.5">
                          <NationLabel teamId={teamId} />
                          {teamId === myTeamId && <span className="shrink-0 rounded bg-sky-500/25 px-1 text-[9px] font-bold text-sky-200">내 팀</span>}
                          {isSeedAdvanced(teamId) && <span className="shrink-0 rounded bg-sky-500/15 px-1 text-[9px] font-bold text-sky-300/80" title="FIFA 랭킹 시드로 하위 라운드 없이 2차 예선부터 자동진출">🔹시드</span>}
                        </span>
                      </th>
                      <td className="py-1.5 text-center text-gray-400 tabular-nums">{s.played}</td>
                      <td className="py-1.5 text-center font-bold text-white tabular-nums">{s.points}</td>
                      <td className="py-1.5 text-center text-gray-400 tabular-nums">{gd > 0 ? `+${gd}` : gd}</td>
                      {chainKeys.length > 1 && isQualClinched(stagePctFor(teamId, QUALIFY_KEY)) ? (
                        // 이미 본선 진출을 확정지은 팀은 이후 녹아웃/추가 예선 확률 대신 '이전 차수에서 진출 확정'을 표시.
                        <>
                          <td colSpan={chainKeys.length - 1} className="py-1.5 text-center text-[10px] font-medium text-emerald-300/80">
                            이전 차수에서 진출 확정
                          </td>
                          <td className="py-1.5 text-right font-bold text-sky-300 tabular-nums">100%</td>
                        </>
                      ) : (
                        chainKeys.map((k) => (
                          <td key={k} className={`py-1.5 text-right tabular-nums ${k === QUALIFY_KEY ? 'font-bold text-sky-300' : 'text-amber-300'}`}>
                            {stagePctFor(teamId, k).toFixed(0)}%
                          </td>
                        ))
                      )}
                      <td className="whitespace-nowrap py-1.5 text-right"><ResultBadge full={full} direct={direct} po={po} provDirect={provisional.direct.has(teamId)} provPo={provisional.po.has(teamId)} qualifyPct={qualifyPct} poPct={poPct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 모바일: 카드형 순위표 (I2) */}
            <ul className="space-y-1.5 sm:hidden" aria-label={`${CONFEDERATION_LABEL_KO[confed]} ${groupLabel} 순위표`}>
              {rows.map(({ teamId, idx, s, gd, direct, po, qualifyPct, poPct }) => (
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
                      {teamId === myTeamId && <span className="shrink-0 rounded bg-sky-500/25 px-1 text-[9px] font-bold text-sky-200">내 팀</span>}
                      {isSeedAdvanced(teamId) && <span className="shrink-0 rounded bg-sky-500/15 px-1 text-[9px] font-bold text-sky-300/80" title="FIFA 랭킹 시드로 2차 예선부터 자동진출">🔹시드</span>}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400 tabular-nums">
                      <span>{s.played}경기</span>
                      <span className="font-bold text-white">{s.points}점</span>
                      <span>{gd > 0 ? `+${gd}` : gd}</span>
                    </div>
                    {chainKeys.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums">
                        {isQualClinched(stagePctFor(teamId, QUALIFY_KEY)) && chainKeys.length > 1 ? (
                          <>
                            <span className="font-medium text-emerald-300/80">이전 차수에서 진출 확정</span>
                            <span className="font-bold text-sky-300">본선 100%</span>
                          </>
                        ) : (
                          chainKeys.map((k) => (
                            <span key={k} className={k === QUALIFY_KEY ? 'font-bold text-sky-300' : 'text-amber-300'}>
                              {shortStageLabel(k)} {stagePctFor(teamId, k).toFixed(0)}%
                            </span>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <ResultBadge full={full} direct={direct} po={po} provDirect={provisional.direct.has(teamId)} provPo={provisional.po.has(teamId)} qualifyPct={qualifyPct} poPct={poPct} />
                </li>
              ))}
            </ul>
            <MatchList teams={groupTeams} matches={groupMatches} onSelectMatch={onSelectMatch} />
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
      {chainKeys.length > 1 && (
        <p className="mt-1 text-[10px] text-gray-600">
          ※ 각 열은 그 차수에 <strong>도달할 확률</strong>입니다. AFC 4·5차처럼 상위 차수에서 직행권을 놓친 팀이 가는
          ‘패자 부활’ 라운드는 강팀일수록 도달 확률이 낮습니다(그 전에 본선 직행).
        </p>
      )}
    </GlassCard>
  )
}

/** 지역예선 화면 (Q3/Q4). 6개 대륙 예선 + 대륙간 PO + 본선 48 확정 + 본선 조추첨 연결. */
/** 월드컵 지역예선 하위 화면(월드컵 본선처럼): 진행·일정 / 조별 순위 / 확률. */
export type QualView = 'progress' | 'standings' | 'probability'

export function QualificationStage({ onStartFinals, view = 'progress' }: { onStartFinals?: () => void; view?: QualView }) {
  const seed = useQualificationStore((s) => s.seed)
  const result = useQualificationStore((s) => s.result)
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
  const finalsPhase = useProgressStore((s) => s.phase)
  const drawField = useDrawStore((s) => s.fieldTeams)
  // 현재 진행 중인 본선이 '이번 예선 결과(qualified48)'로 만든 것인지 확인한다. 예전 대회의 조추첨/진행이
  // 남아 있을 수 있으므로(persist), 조추첨 대상 명단이 지금 진출 48개국과 다르면 그 진행은 '스테일'로 본다.
  const finalsMatchesCurrent =
    drawField != null &&
    result != null &&
    drawField.length === result.qualified48.length &&
    drawField.every((id) => result.qualified48.includes(id))
  const finalsComplete = finalsPhase === 'complete' && finalsMatchesCurrent
  // 조추첨 이후(이번 예선 명단으로 진행 중이거나 종료된 본선)에는 재클릭이 진행을 날려버린다.
  // 스테일(예전 대회) 진행이면 잃을 게 없으므로 '다시하기'가 아니라 '조추첨 진행하기'로 안내한다.
  const finalsUnderway = finalsPhase !== 'idle' && finalsMatchesCurrent
  const champion = useProgressStore((s) => s.champion)
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
        {/* 진행은 캘린더가 주도한다(사용자는 대회를 임의로 시작·시드하지 않는다). 이 탭은 관전·상세 화면이므로
            시작/시드 조작을 두지 않고, 상태만 안내한다. */}
        {!result ? (
          <p className="mx-auto max-w-md rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-gray-300">
            지역예선은 <strong className="text-emerald-300">캘린더</strong>에서 진행됩니다. 상단 고정 바의{' '}
            <strong className="text-emerald-300">▶ 다음 일정 진행</strong>을 눌러 예선을 시작·진행하면, 여기에서 6개 대륙의
            경기·순위·본선 진출 현황을 관전할 수 있어요.
          </p>
        ) : (
          <p className="text-[11px] text-gray-500">
            아래 <strong className="text-gray-300">📅 일별 진행</strong>의 <strong className="text-emerald-300">다음 경기일 ▶</strong> 또는
            캘린더의 <strong className="text-emerald-300">▶ 다음 일정 진행</strong>으로 진행합니다.
            {seed && <> · 예선 시드 <span className="font-mono text-emerald-300">{seed}</span></>}
          </p>
        )}
      </GlassCard>

      {!result ? (
        <GlassCard className="p-8 text-center">
          <p className="text-sm text-gray-400">
            아직 지역예선이 시작되지 않았습니다. <strong className="text-gray-300">캘린더</strong>에서{' '}
            <strong className="text-emerald-300">▶ 다음 일정 진행</strong>으로 예선을 시작하면, 여기에서 6개 대륙의
            경기·순위·본선 진출 현황을 관전할 수 있어요.
          </p>
        </GlassCard>
      ) : (
        <>
          {/* [진행·일정] 진행 컨트롤 */}
          {view === 'progress' && <QualDailyProgress result={result} onSelectMatch={setSelMatch} confed={confed} />}

          {/* [조별 순위] 대륙 선택 + [확률] 확률 계산 버튼 */}
          {(view === 'standings' || view === 'probability') && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {view === 'standings' ? (
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
            ) : (
              <span />
            )}
            <GlassButton
              variant="ghost"
              onClick={computeProbabilities}
              disabled={probLoading}
              title="본선 진출 확률과 예선 단계별(차수별) 진출 확률을 함께 계산합니다"
            >
              {probLoading ? '진출 확률 계산 중…' : probabilities ? '🔄 진출 확률 재계산' : '📊 진출 확률 (단계별 포함)'}
            </GlassButton>
          </div>
          )}

          {(view === 'standings' || view === 'probability') && myTeamId && (
            <MyTeamQualBanner
              teamId={myTeamId}
              qualified48={result.qualified48}
              hosts={result.hosts}
              probability={probabilities ? probabilities[myTeamId] : undefined}
              fullyRevealed={fullyRevealed}
            />
          )}

          {view === 'probability' && probabilities && (
            <p className="-mt-2 text-[10px] text-gray-500">
              {isPartialProgress(result, revealed) ? (
                <span className="text-amber-300">※ 진행 중 — 현재까지 치른 경기 결과를 고정하고 남은 경기만 시뮬레이션한 <strong>조건부 확률</strong>입니다(갱신된 전력 반영). </span>
              ) : (
                '※ '
              )}
              진출 확률은 {PROB_ITERATIONS}회 시뮬레이션 표본 추정치이며 ±오차범위(95% 신뢰구간)를 갖습니다.
            </p>
          )}

          {view === 'standings' && <QualLiveRanking result={result} myTeamId={myTeamId} />}

          {view === 'standings' && fullyRevealed && <QualOverviewCard result={result} onSelect={setConfed} />}

          {view === 'standings' && <ConfederationStandings confed={confed} onSelectMatch={setSelMatch} myTeamId={myTeamId} />}

          {view === 'standings' && !fullyRevealed && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              🗓️ 예선 진행 중 — <strong>진행·일정</strong> 탭에서 <strong>다음 경기일 ▶</strong>로 날짜를 넘기며 관전하세요.
              최종 순위·대륙간 PO·본선 진출국·통계는 예선을 모두 마치면(⏭ 끝) 표시됩니다.
            </p>
          )}

          {view === 'standings' && fullyRevealed && (
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

          <GlassCard id="qual-finals-field" className="scroll-mt-4 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-emerald-300">
                🏆 본선 진출 48개국 <span className="text-gray-500">({result.qualified48.length})</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <QualShareButton seed={seed} result={result} myTeamId={myTeamId} />
                <GlassButton
                  onClick={() => {
                    // 이미 조추첨/본선이 진행 중이면 재클릭이 진행 상황을 초기화하므로 확인을 받는다 (Phase 1 #6).
                    if (
                      finalsUnderway &&
                      !window.confirm(
                        finalsComplete
                          ? '이미 종료된 본선이 있습니다. 조추첨을 다시 하면 이번 대회 결과가 초기화됩니다. 계속할까요?'
                          : '본선이 진행 중입니다. 조추첨을 다시 하면 현재까지의 진행이 모두 사라집니다. 계속할까요?',
                      )
                    ) {
                      // 진행 중인 본선을 이어가려면 조추첨을 다시 하지 않고 일정 탭으로만 이동한다.
                      onStartFinals?.()
                      return
                    }
                    // 예선 폼(Elo 변동)을 본선 컨디션에 반영 → 우승 확률이 예선 실황을 반영.
                    // 조추첨을 즉시 끝내지 않고 "준비"만 해, 조추첨 화면에서 순서대로 진행하게 한다.
                    prepareFinalsDrawFromQualification(result.qualified48, formOffsetsFromResults(result))
                    onStartFinals?.()
                  }}
                >
                  {finalsUnderway ? '🎲 조추첨 다시하기 (진행 초기화) →' : '🎲 조추첨 진행하기 →'}
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
                // 이 예선 결과의 개최국(result.hosts)으로 포트를 계산해, 아래 포트1의 개최국 표기와 정확히 일치시킨다
                // (커리어 모드에서 현재 개최국과 예선 시점 개최국이 다를 때 중복/누락 방지).
                const potHostIds = result.hosts
                const pots = computePots(result.qualified48, potHostIds, potPoints)
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

          {view === 'probability' && fullyRevealed && <QualStatsCard result={result} />}

          {view === 'probability' && fullyRevealed && <QualHighlightsCard result={result} onSelectMatch={setSelMatch} />}

          {view === 'probability' && fullyRevealed && <QualUpsetArticleCard result={result} />}

          {view === 'probability' && fullyRevealed && probabilities && <QualLuckCard result={result} probabilities={probabilities} />}

          {view === 'probability' && myTeamId && ALL_NATIONS_BY_ID[myTeamId] && !result.hosts.includes(myTeamId) && (
            <QualWhatIfCard teamId={myTeamId} seedBase={seed ?? 'WHATIF'} />
          )}

          {view === 'probability' && <QualDifficultyCard />}

          {view === 'probability' && fullyRevealed && drama && (drama.surpriseQualifiers.length > 0 || drama.shockEliminations.length > 0) && (
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

          {view === 'progress' && (
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
          )}
        </>
      )}

      {selMatch && <QualMatchModal match={selMatch} onClose={() => setSelMatch(null)} />}
    </div>
  )
}
