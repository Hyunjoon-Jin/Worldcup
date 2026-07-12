import { GlassCard } from '../common/GlassCard'
import { GROUP_LETTERS } from '../../data/hostSlots'
import type { GroupDifficulty } from '../../engine/groupAnalysis'
import type { GroupLetter } from '../../types/group'

interface Props {
  analysis: GroupDifficulty[]
  onSelect?: (group: GroupLetter) => void
}

/** 능력치 평균(0~1 정규화)을 초록→노랑→빨강 색으로 변환. 어려운 조일수록 붉게. */
function heatColor(t: number): string {
  // t: 0(쉬움)~1(어려움)
  const hue = (1 - t) * 130 // 130(초록)~0(빨강)
  return `hsl(${hue}, 70%, 45%)`
}

/** 12개 조 난이도 히트맵 (v2 #32). 평균 능력치를 색 격자로 한눈에 비교한다. */
export function GroupHeatmap({ analysis, onSelect }: Props) {
  if (analysis.length === 0) return null
  const byGroup = Object.fromEntries(analysis.map((a) => [a.group, a])) as Record<GroupLetter, GroupDifficulty>
  const avgs = analysis.map((a) => a.avgOverall)
  const min = Math.min(...avgs)
  const max = Math.max(...avgs)
  const range = max - min || 1

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-200">🗺 조 난이도 히트맵</h3>
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          쉬움
          <span className="inline-block h-2 w-16 rounded-full" style={{ background: 'linear-gradient(90deg, hsl(130,70%,45%), hsl(60,70%,45%), hsl(0,70%,45%))' }} />
          어려움
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {GROUP_LETTERS.map((g) => {
          const d = byGroup[g]
          if (!d) return <div key={g} className="rounded-lg bg-white/5 p-2" />
          const t = (d.avgOverall - min) / range
          return (
            <button
              key={g}
              onClick={() => onSelect?.(g)}
              className="rounded-lg p-2 text-center text-white transition-transform hover:scale-105"
              style={{ background: heatColor(t) }}
              title={`조 ${g} · 평균 ${d.avgOverall.toFixed(1)} · 난이도 ${d.stars}/5`}
            >
              <div className="font-display text-sm font-bold">{g}</div>
              <div className="text-[10px] opacity-90 tabular-nums">{d.avgOverall.toFixed(1)}</div>
            </button>
          )
        })}
      </div>
    </GlassCard>
  )
}
