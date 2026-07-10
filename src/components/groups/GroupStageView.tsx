import { useMemo, useState } from 'react'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { GlassCard } from '../common/GlassCard'
import { GroupDifficultySummary } from './GroupDifficultySummary'
import { GroupTable } from './GroupTable'
import { GroupDetailPage } from './GroupDetailPage'
import { ThirdPlaceTable } from './ThirdPlaceTable'
import { analyzeGroupDifficulty } from '../../engine/groupAnalysis'
import { computeQualificationStatuses } from '../../engine/qualificationStatus'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useSandboxStore } from '../../store/useSandboxStore'
import type { GroupLetter } from '../../types/group'

const TIER_BADGE: Record<string, { label: string; className: string }> = {
  death: { label: '🔥 죽음의 조', className: 'bg-red-500/20 text-red-300' },
  easy: { label: '🍯 꿀조', className: 'bg-emerald-500/20 text-emerald-300' },
}

export function GroupStageView() {
  const [selected, setSelected] = useState<GroupLetter | null>(null)
  const drawGroups = useDrawStore((s) => s.state.groups)
  const groupMatches = useProgressStore((s) => s.groupMatches)
  const sandboxOverrides = useSandboxStore((s) => s.overrides)

  const groupTeams = useMemo(
    () =>
      Object.fromEntries(
        GROUP_LETTERS.map((g) => [g, (drawGroups[g] as (string | null)[]).filter(Boolean) as string[]]),
      ) as Record<GroupLetter, string[]>,
    [drawGroups],
  )

  const statusByTeam = useMemo(
    () => computeQualificationStatuses(groupTeams, groupMatches),
    [groupTeams, groupMatches],
  )

  const difficultyAnalysis = useMemo(
    () => analyzeGroupDifficulty(groupTeams),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupTeams, sandboxOverrides],
  )
  const tierByGroup = useMemo(
    () => Object.fromEntries(difficultyAnalysis.map((d) => [d.group, d.tier])) as Record<GroupLetter, string>,
    [difficultyAnalysis],
  )

  if (selected) {
    return <GroupDetailPage group={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="flex flex-col gap-5">
      <GroupDifficultySummary analysis={difficultyAnalysis} groupTeams={groupTeams} />
      <ThirdPlaceTable groupTeams={groupTeams} matches={groupMatches} statusByTeam={statusByTeam} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GROUP_LETTERS.map((group) => {
          const badge = TIER_BADGE[tierByGroup[group]]
          return (
            <GlassCard
              key={group}
              className="cursor-pointer p-3 transition-transform hover:scale-[1.02] hover:ring-1 hover:ring-emerald-300/50"
              onClick={() => setSelected(group)}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-sm font-semibold tracking-wide text-emerald-300/90">GROUP {group}</span>
                <div className="flex items-center gap-1.5">
                  {badge && <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${badge.className}`}>{badge.label}</span>}
                  <span className="text-[10px] text-gray-500">자세히 보기 →</span>
                </div>
              </div>
              <GroupTable
                teamIds={groupTeams[group]}
                matches={groupMatches.filter((m) => m.group === group)}
                statusByTeam={statusByTeam}
                compact
              />
            </GlassCard>
          )
        })}
      </div>
    </div>
  )
}
