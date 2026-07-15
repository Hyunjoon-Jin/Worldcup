import { useMemo } from 'react'
import { useHistoryStore } from '../../store/useHistoryStore'
import { useRankHistoryStore, aggregateMonthlyRank } from '../../store/useRankHistoryStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useCareerStore } from '../../store/useCareerStore'
import { useLiveFifaRanking } from '../ranking/useLiveFifaRanking'
import { GlassCard } from '../common/GlassCard'
import {
  aggregateTeamHistory,
  computeFinalsRecord,
  roundReachedFor,
  type EditionRecord,
  type TeamEditionRecord,
} from '../../engine/history'

const FINISH_COLOR: Record<string, string> = {
  우승: 'text-amber-300',
  준우승: 'text-gray-200',
  '3위': 'text-orange-300',
  '4위': 'text-orange-200',
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-2.5 text-center">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-base font-bold tabular-nums text-white">{value}</div>
      {sub && <div className="text-[9px] text-gray-500">{sub}</div>}
    </div>
  )
}

/** 날짜(yyyy-mm-dd) → 'YY.M월' 짧은 라벨. */
function monthLabel(iso: string): string {
  const [y, m] = iso.split('-')
  return `${y.slice(2)}.${Number(m)}월`
}

/** 랭킹 추이 미니 스파크라인(순위는 작을수록 위). 값이 2개 이상일 때만 그린다. */
function RankSparkline({ trend }: { trend: Array<{ label: string; rank: number }> }) {
  if (trend.length < 2) return null
  const ranks = trend.map((t) => t.rank)
  const min = Math.min(...ranks)
  const max = Math.max(...ranks)
  const span = Math.max(1, max - min)
  const W = 220
  const H = 44
  const pts = trend.map((t, i) => {
    const x = trend.length === 1 ? 0 : (i / (trend.length - 1)) * W
    const y = ((t.rank - min) / span) * H // 순위 작을수록 위(y 작음)
    return { x, y, ...t }
  })
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  return (
    <div>
      <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} className="h-14 w-full" role="img" aria-label="월별 FIFA 순위 추이">
        <path d={path} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#38bdf8" />
        ))}
      </svg>
      <div className="flex justify-between text-[9px] text-gray-500">
        <span>{trend[0].label} ({trend[0].rank}위)</span>
        <span>{trend[trend.length - 1].label} ({trend[trend.length - 1].rank}위)</span>
      </div>
    </div>
  )
}

/**
 * 국가 상세의 '역대 기록' — 역대 FIFA 랭킹(최고·최저·평균·추이), 월드컵 통산 전적(2026~)·통산 성적,
 * 연도별 성적을 보여준다. 완료된 대회(역대 기록 스냅샷) + 현재 대회(본선 종료 시)를 합산한다.
 */
export function TeamHistorySection({ teamId }: { teamId: string }) {
  const editions = useHistoryStore((s) => s.editions)
  const phase = useProgressStore((s) => s.phase)
  const champion = useProgressStore((s) => s.champion)
  const groupMatches = useProgressStore((s) => s.groupMatches)
  const knockoutSlots = useProgressStore((s) => s.knockoutSlots)
  const qualResult = useQualificationStore((s) => s.result)
  const year = useCareerStore((s) => s.year)
  const hostIds = useCareerStore((s) => s.hostIds)
  const { rankByTeam, pointsByTeam } = useLiveFifaRanking()
  const currentRank = rankByTeam[teamId] ?? null

  // 완료된 역대 대회 + (본선 종료 시) 현재 대회를 합쳐 통산 집계.
  const allEditions = useMemo<EditionRecord[]>(() => {
    const eds = [...editions]
    if (phase === 'complete' && qualResult && !eds.some((e) => e.year === year)) {
      const knockoutMatches = Object.values(knockoutSlots)
        .map((s) => s.result)
        .filter((m): m is NonNullable<typeof m> => m != null)
      const qualified = qualResult.qualified48.includes(teamId)
      const rec: TeamEditionRecord = {
        qualified,
        roundReached: roundReachedFor(teamId, knockoutMatches, champion, qualified),
        ...computeFinalsRecord(teamId, groupMatches, knockoutMatches),
        rank: currentRank,
        points: pointsByTeam[teamId] ?? null,
      }
      eds.push({ year, hostIds, champion, byTeam: { [teamId]: rec } })
    }
    return eds
  }, [editions, phase, qualResult, knockoutSlots, groupMatches, champion, year, hostIds, teamId, currentRank, pointsByTeam])

  const stats = useMemo(() => aggregateTeamHistory(allEditions, teamId), [allEditions, teamId])
  const perEdition = useMemo(
    () =>
      allEditions
        .filter((e) => e.byTeam[teamId])
        .map((e) => ({ year: e.year, rec: e.byTeam[teamId], isChampion: e.champion === teamId }))
        .sort((a, b) => b.year - a.year),
    [allEditions, teamId],
  )

  // 월별 랭킹 이력(있으면 우선). 없으면 대회 단위 이력으로 대체한다.
  const rankSnapshots = useRankHistoryStore((s) => s.snapshots)
  const monthly = useMemo(() => aggregateMonthlyRank(rankSnapshots, teamId), [rankSnapshots, teamId])
  const bestRank = monthly.best
    ? { rank: monthly.best.rank, sub: monthLabel(monthly.best.date) }
    : stats.bestRank
      ? { rank: stats.bestRank.rank, sub: String(stats.bestRank.year) }
      : null
  const worstRank = monthly.worst
    ? { rank: monthly.worst.rank, sub: monthLabel(monthly.worst.date) }
    : stats.worstRank
      ? { rank: stats.worstRank.rank, sub: String(stats.worstRank.year) }
      : null
  const avgRank = monthly.avg ?? stats.avgRank
  // 순위 추이 그래프는 최근 ~6년(월별)만 표시한다. 최고/최저/평균 통계는 전체 이력 그대로 유지.
  const recentTrend = (() => {
    const t = monthly.trend
    if (t.length === 0) return t
    const lastYm = t[t.length - 1].date.slice(0, 7) // yyyy-mm
    const [ly, lm] = lastYm.split('-').map(Number)
    const cutoffYm = `${String(ly - 6).padStart(4, '0')}-${String(lm).padStart(2, '0')}`
    return t.filter((p) => p.date.slice(0, 7) >= cutoffYm)
  })()
  const rankTrend =
    recentTrend.length >= 2
      ? recentTrend.map((t) => ({ label: monthLabel(t.date), rank: t.rank }))
      : stats.rankTrend.map((t) => ({ label: String(t.year), rank: t.rank }))

  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-sm font-bold text-sky-300">📜 역대 기록 (2026~)</h3>

      {/* FIFA 랭킹 기록 (월별) */}
      <p className="mb-1.5 text-[11px] font-bold text-gray-400">FIFA 랭킹 <span className="font-normal text-gray-600">(월별)</span></p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="현재" value={currentRank != null ? `${currentRank}위` : '—'} />
        <Stat label="역대 최고" value={bestRank ? `${bestRank.rank}위` : '—'} sub={bestRank?.sub} />
        <Stat label="역대 최저" value={worstRank ? `${worstRank.rank}위` : '—'} sub={worstRank?.sub} />
        <Stat label="평균 순위" value={avgRank != null ? `${avgRank.toFixed(1)}위` : '—'} />
      </div>
      {rankTrend.length >= 2 && (
        <div className="mb-4">
          <p className="mb-1 text-[11px] font-bold text-gray-400">순위 추이 <span className="font-normal text-gray-600">(월별)</span></p>
          <RankSparkline trend={rankTrend} />
        </div>
      )}

      {/* 월드컵 통산 전적 */}
      <p className="mb-1.5 text-[11px] font-bold text-gray-400">월드컵 통산 전적</p>
      <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="경기" value={`${stats.gp}`} />
        <Stat label="승" value={`${stats.w}`} />
        <Stat label="무" value={`${stats.d}`} />
        <Stat label="패" value={`${stats.l}`} />
        <Stat label="득실" value={`${stats.gf}:${stats.ga}`} />
        <Stat label="승률" value={`${stats.winPct.toFixed(0)}%`} />
      </div>

      {/* 통산 성적 */}
      <p className="mb-1.5 text-[11px] font-bold text-gray-400">통산 성적</p>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="우승" value={`${stats.titles}회`} />
        <Stat label="본선 진출" value={`${stats.qualifiedCount}회`} sub={`총 ${stats.editions}개 대회`} />
        <Stat label="최고 성적" value={stats.bestFinish} />
      </div>

      {/* 연도별 성적 */}
      <p className="mb-1.5 text-[11px] font-bold text-gray-400">연도별 성적</p>
      {perEdition.length === 0 ? (
        <p className="rounded-lg bg-white/5 p-3 text-center text-[11px] text-gray-500">
          아직 완료된 대회가 없습니다. 본선을 마치고 <strong>다음 대회로</strong> 넘어가면 역대 기록이 쌓입니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[340px] text-left text-xs">
            <thead>
              <tr className="text-gray-400">
                <th className="py-1">연도</th>
                <th className="py-1">최종 성적</th>
                <th className="py-1 text-center">본선 전적</th>
                <th className="py-1 text-right">FIFA 순위</th>
              </tr>
            </thead>
            <tbody>
              {perEdition.map(({ year: y, rec, isChampion }) => (
                <tr key={y} className={`border-t border-white/5 ${isChampion ? 'bg-amber-400/10' : ''}`}>
                  <td className="py-1.5 font-medium text-gray-200 tabular-nums">{y}</td>
                  <td className={`py-1.5 font-bold ${FINISH_COLOR[rec.roundReached] ?? 'text-gray-300'}`}>
                    {isChampion && '🏆 '}
                    {rec.roundReached}
                  </td>
                  <td className="py-1.5 text-center text-gray-400 tabular-nums">
                    {rec.qualified ? `${rec.w}승 ${rec.d}무 ${rec.l}패` : '—'}
                  </td>
                  <td className="py-1.5 text-right text-gray-300 tabular-nums">{rec.rank != null ? `${rec.rank}위` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  )
}
