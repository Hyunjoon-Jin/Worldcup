import { useEffect, useState } from 'react'
import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../../data/nations'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { ProbBar } from './ProbBar'
import { STAGES, type NumericKey } from './probabilityStages'
import { useSimulationStore } from '../../store/useSimulationStore'
import { useCrisisTeams } from '../../store/useCrisisTeams'
import { useMomentumStore } from '../../store/useMomentumStore'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { ProbabilityTrendChart } from './ProbabilityTrendChart'
import { ITERATION_PRESETS, type IterationPreset } from '../../engine/config'

const PRESET_LABEL: Record<IterationPreset, string> = { fast: '빠름', standard: '표준', precise: '정밀' }

function MomentumTag({ value }: { value?: number }) {
  if (value == null || Math.abs(value) < 2) return null
  const rising = value > 0
  return (
    <span
      className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold ${
        rising ? 'bg-orange-500/20 text-orange-300' : 'bg-sky-500/20 text-sky-300'
      }`}
      title={`최근 성적 기반 폼 ${rising ? '+' : ''}${value}`}
    >
      {rising ? '🔥 상승세' : '🥶 하락세'}
    </span>
  )
}

function CrisisTag({ pct }: { pct?: number }) {
  if (pct == null) return null
  return (
    <span
      className="shrink-0 rounded bg-red-500/20 px-1 py-0.5 text-[9px] font-bold text-red-300"
      title={`32강 진출 확률 ${pct.toFixed(1)}% (50% 미만)`}
    >
      🚨 위기
    </span>
  )
}

export function ProbabilityDashboard() {
  const { result, iterations, isComputing, progress, setPreset, run } = useSimulationStore()
  const [sortKey, setSortKey] = useState<NumericKey>('championPct')
  const crisisByTeam = useCrisisTeams()
  const momentumByTeam = useMomentumStore((s) => s.offsets)
  const myTeamId = useMyTeamStore((s) => s.myTeamId)

  useEffect(() => {
    if (!result) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = result
    ? Object.values(result.probabilities).sort((a, b) => b[sortKey] - a[sortKey])
    : []

  return (
    <div className="flex flex-col gap-4">
      <GlassCard strong className="flex flex-col gap-3 p-4">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="text-sm text-gray-300">
            현재까지 확정된 결과를 기반으로 남은 경기를{' '}
            <strong className="text-white">{iterations.toLocaleString()}회</strong> 몬테카를로 시뮬레이션한 확률입니다.
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-white/5 p-0.5" role="group" aria-label="시뮬레이션 정밀도">
              {(Object.keys(ITERATION_PRESETS) as IterationPreset[]).map((preset) => {
                const isActive = iterations === ITERATION_PRESETS[preset]
                return (
                  <button
                    key={preset}
                    onClick={() => setPreset(preset)}
                    aria-pressed={isActive}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      isActive ? 'bg-emerald-500/30 text-emerald-200' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {PRESET_LABEL[preset]}
                  </button>
                )
              })}
            </div>
            <GlassButton onClick={run} disabled={isComputing}>
              {isComputing ? '계산 중…' : '🔄 새로고침'}
            </GlassButton>
          </div>
        </div>
        {isComputing && (
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-emerald-400 transition-[width] duration-150"
              style={{ width: `${Math.max(4, progress * 100)}%` }}
            />
          </div>
        )}
      </GlassCard>

      <ProbabilityTrendChart />

      <GlassCard className="hidden p-4 sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs sm:text-sm">
            <thead>
              <tr className="text-gray-400">
                <th className="w-6 py-1"></th>
                <th className="py-1">국가</th>
                <th className="w-14 py-1 text-right">FIFA</th>
                {STAGES.map((s) => (
                  <th
                    key={s.key}
                    className="cursor-pointer py-1 pr-2 text-right hover:text-white"
                    onClick={() => setSortKey(s.key)}
                  >
                    {s.label} {sortKey === s.key && '▾'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.teamId}
                  className={`border-t border-white/5 ${myTeamId === row.teamId ? 'bg-amber-400/10' : ''}`}
                >
                  <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      {myTeamId === row.teamId && <span title="내 팀">⭐</span>}
                      <TeamLink teamId={row.teamId} className="font-medium whitespace-nowrap text-gray-100" />
                      <MomentumTag value={momentumByTeam[row.teamId]} />
                      <CrisisTag pct={crisisByTeam[row.teamId]?.pct} />
                    </div>
                  </td>
                  <td className="py-1.5 text-right text-gray-500">{TEAMS_BY_ID[row.teamId].fifaRankApprox}위</td>
                  {STAGES.map((s) => (
                    <td key={s.key} className="w-28 py-1.5 pr-2">
                      <ProbBar pct={row[s.key]} color={s.color} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="flex flex-col gap-2 sm:hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto px-1 text-[11px] text-gray-400">
          <span className="shrink-0">정렬:</span>
          {STAGES.map((s) => (
            <button
              key={s.key}
              onClick={() => setSortKey(s.key)}
              className={`shrink-0 rounded-full px-2 py-0.5 ${
                sortKey === s.key ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-gray-400'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {rows.map((row, idx) => (
          <GlassCard key={row.teamId} className={`p-3 ${myTeamId === row.teamId ? 'ring-1 ring-amber-400/40' : ''}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs text-gray-500">{idx + 1}</span>
              {myTeamId === row.teamId && <span title="내 팀">⭐</span>}
              <TeamLink teamId={row.teamId} className="min-w-0 font-medium text-gray-100" />
              <span className="shrink-0 text-[10px] text-gray-500">FIFA {TEAMS_BY_ID[row.teamId].fifaRankApprox}위</span>
              <MomentumTag value={momentumByTeam[row.teamId]} />
              <CrisisTag pct={crisisByTeam[row.teamId]?.pct} />
            </div>
            <div className="space-y-1">
              {STAGES.map((s) => (
                <ProbBar key={s.key} pct={row[s.key]} color={s.color} label={s.label} />
              ))}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}
