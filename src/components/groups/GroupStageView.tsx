import { useState } from 'react'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { GlassCard } from '../common/GlassCard'
import { GroupTable } from './GroupTable'
import { GroupDetailPage } from './GroupDetailPage'
import { ThirdPlaceTable } from './ThirdPlaceTable'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import type { GroupLetter } from '../../types/group'

export function GroupStageView() {
  const [selected, setSelected] = useState<GroupLetter | null>(null)
  const drawGroups = useDrawStore((s) => s.state.groups)
  const groupMatches = useProgressStore((s) => s.groupMatches)

  if (selected) {
    return <GroupDetailPage group={selected} onBack={() => setSelected(null)} />
  }

  const groupTeams = Object.fromEntries(
    GROUP_LETTERS.map((g) => [g, (drawGroups[g] as (string | null)[]).filter(Boolean) as string[]]),
  ) as Record<GroupLetter, string[]>

  return (
    <div className="flex flex-col gap-5">
      <ThirdPlaceTable groupTeams={groupTeams} matches={groupMatches} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GROUP_LETTERS.map((group) => (
          <GlassCard
            key={group}
            className="cursor-pointer p-3 transition-transform hover:scale-[1.02] hover:ring-1 hover:ring-emerald-300/50"
            onClick={() => setSelected(group)}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold tracking-wide text-emerald-300/90">GROUP {group}</span>
              <span className="text-[10px] text-gray-500">자세히 보기 →</span>
            </div>
            <GroupTable
              teamIds={groupTeams[group]}
              matches={groupMatches.filter((m) => m.group === group)}
              compact
            />
          </GlassCard>
        ))}
      </div>
    </div>
  )
}
