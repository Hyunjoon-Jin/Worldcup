import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { ProbBar } from '../probability/ProbBar'
import { CupProbabilityTrendChart } from './CupProbabilityTrendChart'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { useLiveRankLookup } from '../ranking/useLiveFifaRanking'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import type { CupProbabilities } from '../../engine/continental/cupProbability'
import type { KnockoutRound } from '../../types/match'

/** 최근 공개 경기 성적 기반 폼(월드컵 MomentumTag와 동형). */
function MomentumTag({ value }: { value?: number }) {
  if (value == null || Math.abs(value) < 2) return null
  const rising = value > 0
  return (
    <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold ${rising ? 'bg-orange-500/20 text-orange-300' : 'bg-sky-500/20 text-sky-300'}`} title={`최근 성적 기반 폼 ${rising ? '+' : ''}${value}`}>
      {rising ? '🔥 상승세' : '🥶 하락세'}
    </span>
  )
}

/** 조별 통과 확률 50% 미만이면 위기(월드컵 CrisisTag와 동형). */
function CrisisTag({ pct }: { pct?: number }) {
  if (pct == null || pct >= 50) return null
  return (
    <span className="shrink-0 rounded bg-red-500/20 px-1 py-0.5 text-[9px] font-bold text-red-300" title={`조별 통과 확률 ${pct.toFixed(1)}% (50% 미만)`}>
      🚨 위기
    </span>
  )
}

const ROUND_LABEL: Record<string, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위', FINAL: '결승' }
// 월드컵 확률 대시보드(probabilityStages)와 동일한 색 팔레트 — 라운드가 진행될수록 짙은 파랑, 우승은 최심.
const ROUND_GRADIENT = ['#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf']
const CHAMPION_COLOR = '#1c5cab'

// 대륙컵도 월드컵과 동일한 '빠름/표준/정밀' 프리셋을 노출한다(대륙컵은 대회 전체를 반복하므로 회수는 가볍게).
const CUP_PRESETS = { fast: 100, standard: 200, precise: 500 } as const
type CupPreset = keyof typeof CUP_PRESETS
const PRESET_LABEL: Record<CupPreset, string> = { fast: '빠름', standard: '표준', precise: '정밀' }

type SortKey = 'champion' | KnockoutRound

/**
 * 대륙컵 진출 체인 확률 대시보드 — 월드컵 ProbabilityDashboard와 **완전히 동일한** 표/막대/색/정렬/프리셋으로,
 * 각 녹아웃 라운드 도달(첫 라운드=조별 통과) → 우승 확률을 보여준다. 정렬·내 팀 강조·FIFA 순위·프리셋·새로고침 지원.
 */
export function CupProbabilityView({
  probabilities,
  chainRounds,
  onRefresh,
  momentumByTeam,
  trend = [],
}: {
  probabilities: CupProbabilities
  chainRounds: KnockoutRound[]
  onRefresh: (iterations?: number) => void
  momentumByTeam?: Record<string, number>
  trend?: Array<{ stage: number; byTeam: Record<string, number> }>
}) {
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const liveRank = useLiveRankLookup()
  const [sortKey, setSortKey] = useState<SortKey>('champion')

  // 체인 컬럼: 각 녹아웃 라운드 도달(3·4위전 제외, 첫 라운드=조별 통과) + 우승. (월드컵 CHAIN과 동형)
  const rounds = chainRounds.filter((r) => r !== 'THIRD')
  const firstRound = rounds[0]
  const groupPassOf = (id: string) => (firstRound ? probabilities.byTeam[id]?.reach[firstRound] ?? 0 : 0)
  const columns: { key: SortKey; label: string; color: string }[] = [
    ...rounds.map((r, i) => ({ key: r as SortKey, label: ROUND_LABEL[r] ?? r, color: ROUND_GRADIENT[Math.min(i, ROUND_GRADIENT.length - 1)] })),
    { key: 'champion' as SortKey, label: '우승', color: CHAMPION_COLOR },
  ]

  const valueOf = (id: string, key: SortKey): number => {
    const p = probabilities.byTeam[id]
    if (!p) return 0
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
      <GlassCard strong className="flex flex-col gap-3 p-4">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="text-sm text-gray-300">
            <strong className="text-emerald-300">조별 통과~우승</strong>까지 진출 단계별 확률입니다.{' '}
            <strong className="text-white">{probabilities.iterations.toLocaleString()}회</strong> 몬테카를로 시뮬레이션했습니다.
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-white/5 p-0.5" role="group" aria-label="시뮬레이션 정밀도">
              {(Object.keys(CUP_PRESETS) as CupPreset[]).map((preset) => {
                const isActive = probabilities.iterations === CUP_PRESETS[preset]
                return (
                  <button
                    key={preset}
                    onClick={() => onRefresh(CUP_PRESETS[preset])}
                    aria-pressed={isActive}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${isActive ? 'bg-emerald-500/30 text-emerald-200' : 'text-gray-400 hover:text-white'}`}
                  >
                    {PRESET_LABEL[preset]}
                  </button>
                )
              })}
            </div>
            <GlassButton onClick={() => onRefresh()}>🔄 새로고침</GlassButton>
          </div>
        </div>
      </GlassCard>

      <CupProbabilityTrendChart trend={trend} />

      {/* 데스크톱: 정렬 가능한 전체 표 */}
      <GlassCard className="hidden p-4 sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs sm:text-sm">
            <thead>
              <tr className="text-gray-400">
                <th className="w-6 py-1"></th>
                <th className="py-1">국가</th>
                <th className="w-14 py-1 text-right">FIFA</th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className="cursor-pointer py-1 pr-2 text-right hover:text-white"
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
                    <div className="flex items-center gap-1.5">
                      {myTeamId === id && <span title="내 팀">⭐</span>}
                      <TeamLink teamId={id} className="font-medium whitespace-nowrap text-gray-100" />
                      <MomentumTag value={momentumByTeam?.[id]} />
                      <CrisisTag pct={groupPassOf(id)} />
                    </div>
                  </td>
                  <td className="py-1.5 text-right text-gray-500">{liveRank(id, ALL_NATIONS_BY_ID[id]?.fifaRankApprox ?? 999)}위</td>
                  {columns.map((c) => (
                    <td key={c.key} className="w-28 py-1.5 pr-2">
                      <ProbBar pct={valueOf(id, c.key)} color={c.color} />
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
              <MomentumTag value={momentumByTeam?.[id]} />
              <CrisisTag pct={groupPassOf(id)} />
            </div>
            <div className="space-y-1">
              {columns.map((c) => (
                <ProbBar key={c.key} pct={valueOf(id, c.key)} color={c.color} label={c.label} />
              ))}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}
