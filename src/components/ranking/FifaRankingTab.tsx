import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { ALL_NATIONS } from '../../data/nations'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { flattenPlayed, collectPlayedByConfed } from '../../engine/qualification/conditional'
import { buildQualCalendar } from '../../engine/qualification/calendar'
import {
  computeLiveRanking,
  computeRankingTrend,
  basePointsFromRank,
  type LiveRankRow,
  type TeamTrend,
} from '../../engine/qualification/ranking'

const TREND_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#22d3ee', '#fb923c']

function TrendChart({ trend }: { trend: TeamTrend[] }) {
  const W = 360
  const H = 160
  const pad = { l: 6, r: 6, t: 10, b: 8 }
  const n = trend[0]?.series.length ?? 0
  const allPts = trend.flatMap((t) => t.series.map((s) => s.points))
  if (allPts.length === 0) return null
  const minP = Math.min(...allPts)
  const maxP = Math.max(...allPts)
  const range = Math.max(1, maxP - minP)
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - (v - minP) / range) * (H - pad.t - pad.b)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="FIFA 점수 변동 추이">
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

/** 대회 진행 전 기본 FIFA 랭킹(경기 없음). */
function baseRanking(): LiveRankRow[] {
  return ALL_NATIONS.map((n) => ({ teamId: n.id, points: Math.round(basePointsFromRank(n.fifaRankApprox)) }))
    .sort((a, b) => b.points - a.points)
    .map((r, i) => ({
      teamId: r.teamId,
      rank: i + 1,
      baseRank: i + 1,
      rankDelta: 0,
      points: r.points,
      basePoints: r.points,
      pointsDelta: 0,
    }))
}

/** 별도 'FIFA 랭킹' 탭. 실제 FIFA 점수 산정 방식으로 예선 진행을 반영한 전체 순위·점수·변동을 보여준다. */
export function FifaRankingTab() {
  const result = useQualificationStore((s) => s.result)
  const revealed = useQualificationStore((s) => s.revealed)
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<'rank' | 'up' | 'down'>('rank')

  const ranking = useMemo<LiveRankRow[]>(() => {
    if (!result) return baseRanking()
    return computeLiveRanking(result, flattenPlayed(collectPlayedByConfed(result, revealed)))
  }, [result, revealed])

  const calendar = useMemo(() => (result ? buildQualCalendar(result) : []), [result])
  const dayCount = useMemo(
    () =>
      calendar.filter((d) => Object.keys(d.revealedByConfed).every((c) => d.revealedByConfed[c] <= (revealed[c] ?? 0)))
        .length,
    [calendar, revealed],
  )
  const trend = useMemo(() => {
    if (!result || dayCount === 0) return []
    const ids = ranking.slice(0, 6).map((r) => r.teamId)
    if (myTeamId && !ids.includes(myTeamId) && ranking.some((r) => r.teamId === myTeamId)) ids.push(myTeamId)
    return computeRankingTrend(result, calendar.slice(0, dayCount), ids)
  }, [result, calendar, dayCount, ranking, myTeamId])

  const sorted = useMemo(() => {
    let rows = ranking
    if (sortMode === 'up') rows = [...ranking].sort((a, b) => b.rankDelta - a.rankDelta)
    else if (sortMode === 'down') rows = [...ranking].sort((a, b) => a.rankDelta - b.rankDelta)
    const q = query.trim()
    if (!q) return rows
    return rows.filter((r) => {
      const n = ALL_NATIONS.find((x) => x.id === r.teamId)
      return n?.nameKo.includes(q) || n?.nameEn.toLowerCase().includes(q.toLowerCase()) || r.teamId.includes(q.toUpperCase())
    })
  }, [ranking, sortMode, query])

  return (
    <div className="flex flex-col gap-4">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">🌐 FIFA 세계 랭킹</p>
        <p className="text-xs text-gray-400">
          실제 FIFA 점수 산정 방식(P = P + I×(승점−기대승점), 예선 I=25)으로 지역예선 진행 결과를 실시간 반영합니다.
          {!result && <span className="text-amber-300"> 지역예선을 진행하면 경기 결과가 랭킹에 누적 반영됩니다.</span>}
        </p>
      </GlassCard>

      {trend.length > 0 && trend[0].series.length > 1 && (
        <GlassCard className="p-4">
          <p className="mb-2 text-sm font-bold text-sky-300">📈 점수 변동 추이 (상위권)</p>
          <TrendChart trend={trend} />
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {trend.map((t, ti) => (
              <span key={t.teamId} className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: TREND_COLORS[ti % TREND_COLORS.length] }} />
                {ALL_NATIONS.find((n) => n.id === t.teamId)?.nameKo ?? t.teamId}
                <span className="tabular-nums text-gray-500">{t.series[t.series.length - 1].points}</span>
              </span>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-sky-300">📊 전체 순위 ({ranking.length}개국)</h3>
          <div className="flex items-center gap-2">
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
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="국가 검색"
              aria-label="국가 검색"
              className="w-28 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder:text-gray-500 focus:border-sky-400/50 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-xs sm:text-sm">
            <caption className="sr-only">FIFA 세계 랭킹 점수 현황</caption>
            <thead>
              <tr className="text-gray-400">
                <th scope="col" className="w-10 py-1 text-center">순위</th>
                <th scope="col" className="py-1">국가</th>
                <th scope="col" className="w-16 py-1 text-right">점수</th>
                <th scope="col" className="w-20 py-1 text-right">등락</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const up = row.rankDelta > 0 || (row.rankDelta === 0 && row.pointsDelta > 0)
                const moved = row.rankDelta !== 0 || row.pointsDelta !== 0
                return (
                  <tr key={row.teamId} className={`border-t border-white/5 ${row.teamId === myTeamId ? 'bg-sky-500/10' : ''}`}>
                    <td className="py-1.5 text-center text-gray-500 tabular-nums">{row.rank}</td>
                    <th scope="row" className="py-1.5 font-normal">
                      <span className="inline-flex items-center gap-1.5">
                        <TeamLink teamId={row.teamId} />
                        {row.teamId === myTeamId && <span className="rounded bg-sky-500/25 px-1 text-[9px] font-bold text-sky-200">내 팀</span>}
                      </span>
                    </th>
                    <td className="py-1.5 text-right font-bold tabular-nums text-white">{row.points}</td>
                    <td className="py-1.5 text-right">
                      {!moved ? (
                        <span className="text-[10px] text-gray-600">–</span>
                      ) : (
                        <span className={`text-[10px] font-bold tabular-nums ${up ? 'text-emerald-300' : 'text-red-300'}`}>
                          {row.rankDelta !== 0 && `${up ? '▲' : '▼'}${Math.abs(row.rankDelta)} `}
                          <span className="font-normal">({row.pointsDelta >= 0 ? '+' : ''}{row.pointsDelta})</span>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-xs text-gray-500">검색 결과가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}
