import { useEffect, useState } from 'react'
import { TEAMS_BY_ID } from '../../data/teams'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { ProbBar } from './ProbBar'
import { STAGES, type NumericKey } from './probabilityStages'
import { useSimulationStore } from '../../store/useSimulationStore'
import { useCrisisTeams } from '../../store/useCrisisTeams'

function CrisisTag({ drop }: { drop?: number }) {
  if (drop == null) return null
  return (
    <span
      className="shrink-0 rounded bg-red-500/20 px-1 py-0.5 text-[9px] font-bold text-red-300"
      title={`직전 대비 32강 진출 확률 ${drop.toFixed(1)}%p 하락`}
    >
      🚨 위기
    </span>
  )
}

export function ProbabilityDashboard() {
  const { result, iterations, isComputing, setIterations, run } = useSimulationStore()
  const [sortKey, setSortKey] = useState<NumericKey>('championPct')
  const crisisByTeam = useCrisisTeams()

  useEffect(() => {
    if (!result) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = result
    ? Object.values(result.probabilities).sort((a, b) => b[sortKey] - a[sortKey])
    : []

  return (
    <div className="flex flex-col gap-4">
      <GlassCard strong className="flex flex-col items-center gap-3 p-4 text-center sm:flex-row sm:justify-between">
        <div className="text-sm text-gray-300">
          현재까지 확정된 결과를 기반으로 남은 경기를{' '}
          <strong className="text-white">{iterations.toLocaleString()}회</strong> 몬테카를로 시뮬레이션한 확률입니다.
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={200}
            max={5000}
            step={100}
            value={iterations}
            onChange={(e) => setIterations(Number(e.target.value))}
            className="w-32 accent-emerald-400"
          />
          <GlassButton onClick={run} disabled={isComputing}>
            {isComputing ? '계산 중…' : '🔄 새로고침'}
          </GlassButton>
        </div>
      </GlassCard>

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
                <tr key={row.teamId} className="border-t border-white/5">
                  <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <TeamLink teamId={row.teamId} className="font-medium whitespace-nowrap text-gray-100" />
                      <CrisisTag drop={crisisByTeam[row.teamId]?.drop} />
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
          <GlassCard key={row.teamId} className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs text-gray-500">{idx + 1}</span>
              <TeamLink teamId={row.teamId} className="min-w-0 font-medium text-gray-100" />
              <span className="shrink-0 text-[10px] text-gray-500">FIFA {TEAMS_BY_ID[row.teamId].fifaRankApprox}위</span>
              <CrisisTag drop={crisisByTeam[row.teamId]?.drop} />
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
