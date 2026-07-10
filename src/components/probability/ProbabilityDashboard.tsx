import { useEffect, useState } from 'react'
import { TEAMS_BY_ID } from '../../data/teams'
import { FlagIcon } from '../common/FlagIcon'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { useSimulationStore } from '../../store/useSimulationStore'
import type { TeamProbabilities } from '../../types/simulation'

type NumericKey = Exclude<keyof TeamProbabilities, 'teamId'>

const STAGES: { key: NumericKey; label: string; color: string }[] = [
  { key: 'groupStagePct', label: '조별통과', color: '#6da7ec' },
  { key: 'r16Pct', label: '16강', color: '#5598e7' },
  { key: 'qfPct', label: '8강', color: '#3987e5' },
  { key: 'sfPct', label: '4강', color: '#2a78d6' },
  { key: 'finalPct', label: '결승', color: '#256abf' },
  { key: 'championPct', label: '우승', color: '#1c5cab' },
]

function ProbBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`, background: color }} />
      </div>
      <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-gray-300">{pct.toFixed(1)}%</span>
    </div>
  )
}

export function ProbabilityDashboard() {
  const { result, iterations, isComputing, setIterations, run } = useSimulationStore()
  const [sortKey, setSortKey] = useState<NumericKey>('championPct')

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

      <GlassCard className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs sm:text-sm">
            <thead>
              <tr className="text-gray-400">
                <th className="w-6 py-1"></th>
                <th className="py-1">국가</th>
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
              {rows.map((row, idx) => {
                const team = TEAMS_BY_ID[row.teamId]
                return (
                  <tr key={row.teamId} className="border-t border-white/5">
                    <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                    <td className="py-1.5">
                      <div className="flex items-center gap-2">
                        <FlagIcon iso2={team.iso2} className="h-3 w-4" />
                        <span className="font-medium whitespace-nowrap text-gray-100">{team.nameKo}</span>
                      </div>
                    </td>
                    {STAGES.map((s) => (
                      <td key={s.key} className="w-28 py-1.5 pr-2">
                        <ProbBar pct={row[s.key]} color={s.color} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}
