import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { ProbBar } from '../probability/ProbBar'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { useLiveRankLookup } from '../ranking/useLiveFifaRanking'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import type { CupProbabilities } from '../../engine/continental/cupProbability'
import type { KnockoutRound } from '../../types/match'

const ROUND_LABEL: Record<string, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위', FINAL: '결승' }
const BAR_COLOR = ['#34d399', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fbbf24']

type SortKey = 'qualify' | 'champion' | KnockoutRound

/**
 * 대륙컵 진출 체인 확률 대시보드(월드컵 ProbabilityDashboard와 동형): 참가 전 팀을 대상으로 조별 통과 →
 * 각 녹아웃 라운드 도달 → 우승 확률을 막대로 보여준다. 정렬·내 팀 강조·FIFA 순위·새로고침을 지원한다.
 */
export function CupProbabilityView({
  probabilities,
  chainRounds,
  onRefresh,
}: {
  probabilities: CupProbabilities
  chainRounds: KnockoutRound[]
  onRefresh: () => void
}) {
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const liveRank = useLiveRankLookup()
  const [sortKey, setSortKey] = useState<SortKey>('champion')

  // 체인 컬럼: 조별 통과 + 각 녹아웃 라운드(3·4위전 제외) + 우승.
  const rounds = chainRounds.filter((r) => r !== 'THIRD')
  const columns: { key: SortKey; label: string }[] = [
    { key: 'qualify', label: '조별 통과' },
    ...rounds.map((r) => ({ key: r as SortKey, label: `${ROUND_LABEL[r] ?? r} 진출` })),
    { key: 'champion', label: '우승' },
  ]

  const valueOf = (id: string, key: SortKey): number => {
    const p = probabilities.byTeam[id]
    if (!p) return 0
    if (key === 'qualify') return p.qualify
    if (key === 'champion') return p.champion
    return p.reach[key] ?? 0
  }

  const rows = useMemo(
    () => Object.keys(probabilities.byTeam).sort((a, b) => valueOf(b, sortKey) - valueOf(a, sortKey) || a.localeCompare(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [probabilities, sortKey],
  )

  return (
    <div className="flex flex-col gap-4">
      <GlassCard strong className="flex flex-col items-center gap-2 p-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="text-sm text-gray-300">
          <strong className="text-emerald-300">조별 통과~우승</strong>까지 각 단계 도달 확률입니다.{' '}
          <strong className="text-white">{probabilities.iterations.toLocaleString()}회</strong> 몬테카를로 시뮬레이션. 막대가 길수록 높습니다.
        </div>
        <GlassButton onClick={onRefresh}>🔄 새로고침</GlassButton>
      </GlassCard>

      {/* 데스크톱: 정렬 가능한 전체 표 */}
      <GlassCard className="hidden p-4 sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs sm:text-sm">
            <thead>
              <tr className="text-gray-400">
                <th className="w-6 py-1"></th>
                <th className="py-1">국가</th>
                <th className="w-14 py-1 text-right">FIFA</th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`cursor-pointer py-1 pr-2 text-right hover:text-white ${c.key === 'champion' ? 'text-amber-300' : ''}`}
                    onClick={() => setSortKey(c.key)}
                  >
                    {c.label} {sortKey === c.key && '▾'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((id, idx) => (
                <tr key={id} className={`border-t border-white/5 ${myTeamId === id ? 'bg-amber-400/10' : ''}`}>
                  <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                  <td className="py-1.5">
                    <span className="flex items-center gap-1.5">
                      {myTeamId === id && <span title="내 팀">⭐</span>}
                      <TeamLink teamId={id} className="font-medium whitespace-nowrap text-gray-100" />
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-gray-500">{liveRank(id, ALL_NATIONS_BY_ID[id]?.fifaRankApprox ?? 999)}위</td>
                  {columns.map((c, ci) => (
                    <td key={c.key} className="w-28 py-1.5 pr-2">
                      <ProbBar pct={valueOf(id, c.key)} color={BAR_COLOR[Math.min(ci, BAR_COLOR.length - 1)]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* 모바일: 카드 + 정렬 칩 */}
      <div className="flex flex-col gap-2 sm:hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto px-1 text-[11px] text-gray-400">
          <span className="shrink-0">정렬:</span>
          {columns.map((c) => (
            <button
              key={c.key}
              onClick={() => setSortKey(c.key)}
              className={`shrink-0 rounded-full px-2 py-0.5 ${sortKey === c.key ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-gray-400'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {rows.map((id, idx) => (
          <GlassCard key={id} className={`p-3 ${myTeamId === id ? 'ring-1 ring-amber-400/40' : ''}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs text-gray-500">{idx + 1}</span>
              {myTeamId === id && <span title="내 팀">⭐</span>}
              <TeamLink teamId={id} className="min-w-0 font-medium text-gray-100" />
              <span className="shrink-0 text-[10px] text-gray-500">FIFA {liveRank(id, ALL_NATIONS_BY_ID[id]?.fifaRankApprox ?? 999)}위</span>
            </div>
            <div className="space-y-1">
              {columns.map((c, ci) => (
                <ProbBar key={c.key} pct={valueOf(id, c.key)} color={BAR_COLOR[Math.min(ci, BAR_COLOR.length - 1)]} label={c.label} />
              ))}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}
