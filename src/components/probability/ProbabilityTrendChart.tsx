import { useMemo } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TEAMS_BY_ID } from '../../data/teams'
import { useSimulationStore } from '../../store/useSimulationStore'
import { STAGES } from './probabilityStages'

// 라인 색상(대시보드 스테이지 색과 무관한 독립 팔레트)
const LINE_COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa']

/** 경기 진행에 따른 우승 확률 추이 라인 차트 (v2 #33). 인라인 SVG, 외부 라이브러리 없음. */
export function ProbabilityTrendChart() {
  const history = useSimulationStore((s) => s.history)
  const result = useSimulationStore((s) => s.result)

  const { lines, maxPct, xLabels } = useMemo(() => {
    if (history.length < 2 || !result)
      return { lines: [] as { teamId: string; points: ProbPointXY[] }[], maxPct: 1, xLabels: [] as number[] }

    // 최신 시점 기준 상위 5팀을 추적 대상으로
    const latest = history[history.length - 1].probs
    const topTeams = Object.entries(latest)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([teamId]) => teamId)

    const xs = history.map((h) => h.matchesPlayed)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const spanX = maxX - minX || 1
    let maxPct = 1
    for (const h of history) for (const t of topTeams) maxPct = Math.max(maxPct, h.probs[t] ?? 0)

    const lines = topTeams.map((teamId) => ({
      teamId,
      points: history.map((h) => ({
        x: ((h.matchesPlayed - minX) / spanX) * 100,
        y: 100 - ((h.probs[teamId] ?? 0) / maxPct) * 100,
        pct: h.probs[teamId] ?? 0,
      })),
    }))

    return { lines, maxPct, xLabels: [minX, maxX] }
  }, [history, result])

  if (lines.length === 0) return null

  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-sm font-bold text-emerald-300">📈 우승 확률 추이</h3>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 100 56" preserveAspectRatio="none" className="h-40 w-full min-w-[320px]" role="img" aria-label="우승 확률 추이 라인 차트">
          {/* 가로 기준선 */}
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1="0" x2="100" y1={f * 50 + 3} y2={f * 50 + 3} stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.3" />
          ))}
          {lines.map((line, i) => (
            <polyline
              key={line.teamId}
              points={line.points.map((p) => `${p.x},${p.y * 0.5 + 3}`).join(' ')}
              fill="none"
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth="0.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      {/* 범례 */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {lines.map((line, i) => (
          <span key={line.teamId} className="flex items-center gap-1 text-[11px] text-gray-300">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} />
            {TEAMS_BY_ID[line.teamId]?.nameKo ?? line.teamId}
            <span className="text-gray-500">{(line.points.at(-1)?.pct ?? 0).toFixed(1)}%</span>
          </span>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-500">
        <span>{xLabels[0]}경기</span>
        <span>최대 {maxPct.toFixed(0)}% · {STAGES.find((s) => s.key === 'championPct')?.label ?? '우승'}</span>
        <span>{xLabels[1]}경기</span>
      </div>
    </GlassCard>
  )
}

interface ProbPointXY {
  x: number
  y: number
  pct: number
}
