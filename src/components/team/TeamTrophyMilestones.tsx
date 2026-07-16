import { useMemo } from 'react'
import { GlassCard } from '../common/GlassCard'
import { useHistoryStore } from '../../store/useHistoryStore'
import { useContinentalHistoryStore, cupTitleEvents } from '../../store/useContinentalHistoryStore'
import { titlesFor } from '../../data/history'
import { CUP_FORMATS, type CupId } from '../../data/continental/formats'

interface Milestone {
  key: string
  icon: string
  name: string
  count: number
  years: number[]
  tone: 'wc' | 'cup'
}

/**
 * 팀 상세의 '트로피 캐비닛' — 이 국가가 획득한 모든 트로피(월드컵 + 6개 대륙컵)를 마일스톤 형태로 보관·표시한다.
 * 월드컵은 실제 역대 우승(WORLD_CUP_TITLES) + 시뮬 커리어 우승(useHistoryStore)을 합치고, 대륙컵은
 * useContinentalHistoryStore의 우승 이력을 대회별로 집계한다.
 */
export function TeamTrophyMilestones({ teamId }: { teamId: string }) {
  const wcEditions = useHistoryStore((s) => s.editions)
  const cupEditions = useContinentalHistoryStore((s) => s.editions)

  const milestones = useMemo<Milestone[]>(() => {
    const out: Milestone[] = []
    // 월드컵: 실제 역대 우승 + 시뮬 커리어 우승(연도 중복 제거).
    const staticWc = titlesFor(teamId)?.years ?? []
    const careerWc = wcEditions.filter((e) => e.champion === teamId).map((e) => e.year)
    const wcYears = [...new Set([...staticWc, ...careerWc])].sort((a, b) => a - b)
    if (wcYears.length > 0) out.push({ key: 'WC', icon: '🏆', name: 'FIFA 월드컵', count: wcYears.length, years: wcYears, tone: 'wc' })

    // 대륙컵: 대회별 우승 집계.
    const byCup = new Map<CupId, number[]>()
    for (const ev of cupTitleEvents(cupEditions, teamId)) {
      const arr = byCup.get(ev.cupId) ?? []
      if (ev.year != null) arr.push(ev.year)
      else arr.push(0) // 연도 미상은 0으로(표시 시 제외)
      byCup.set(ev.cupId, arr)
    }
    for (const [cupId, years] of byCup) {
      out.push({
        key: cupId,
        icon: '🌍',
        name: CUP_FORMATS[cupId].nameKo,
        count: years.length,
        years: years.filter((y) => y > 0).sort((a, b) => a - b),
        tone: 'cup',
      })
    }
    return out.sort((a, b) => (a.tone === b.tone ? b.count - a.count : a.tone === 'wc' ? -1 : 1))
  }, [teamId, wcEditions, cupEditions])

  const total = milestones.reduce((s, m) => s + m.count, 0)

  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-sm font-bold text-amber-300">
        🏆 트로피 캐비닛 {total > 0 && <span className="font-normal text-gray-400">· 총 {total}개</span>}
      </h3>
      {milestones.length === 0 ? (
        <p className="text-xs text-gray-500">아직 획득한 트로피가 없습니다. 대회에서 우승하면 이곳에 마일스톤으로 보관됩니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {milestones.map((m) => (
            <div key={m.key} className={`flex items-center gap-3 rounded-xl border p-3 ${m.tone === 'wc' ? 'border-amber-400/30 bg-amber-400/10' : 'border-violet-400/20 bg-violet-500/[0.06]'}`}>
              <span className="text-2xl">{m.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-1.5 text-sm font-bold text-white">
                  {m.name}
                  <span className={m.tone === 'wc' ? 'text-amber-300' : 'text-violet-300'}>×{m.count}</span>
                </p>
                {m.years.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.years.map((y, i) => (
                      <span key={`${y}-${i}`} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums text-gray-300">{y}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
