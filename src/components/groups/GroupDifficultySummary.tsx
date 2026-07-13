import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import type { GroupDifficulty } from '../../engine/groupAnalysis'
import type { GroupLetter } from '../../types/group'

interface GroupDifficultySummaryProps {
  analysis: GroupDifficulty[]
  groupTeams: Record<GroupLetter, string[]>
}

function StarRating({ stars }: { stars: number }) {
  return (
    <span className="text-[10px] tracking-tight text-amber-300" aria-label={`난이도 ${stars}/5`} title={`난이도 ${stars}/5`}>
      {'★'.repeat(stars)}
      <span className="text-gray-600">{'★'.repeat(Math.max(0, 5 - stars))}</span>
    </span>
  )
}

function GroupMiniRow({
  group,
  avgOverall,
  stars,
  teamIds,
}: {
  group: GroupLetter
  avgOverall: number
  stars: number
  teamIds: string[]
}) {
  return (
    <div className="rounded-lg bg-white/5 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-xs font-semibold text-gray-200">GROUP {group}</span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <StarRating stars={stars} />
          평균 {avgOverall.toFixed(1)}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {teamIds.map((id) => (
          <TeamLink key={id} teamId={id} className="text-[11px] text-gray-300" flagClassName="h-2.5 w-3.5" />
        ))}
      </div>
    </div>
  )
}

export function GroupDifficultySummary({ analysis, groupTeams }: GroupDifficultySummaryProps) {
  const death = analysis.filter((a) => a.tier === 'death')
  const easy = analysis.filter((a) => a.tier === 'easy').slice().reverse()

  if (analysis.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-bold text-red-300">🔥 죽음의 조 TOP 3</h3>
        <div className="space-y-2">
          {death.map((d) => (
            <GroupMiniRow key={d.group} group={d.group} avgOverall={d.avgOverall} stars={d.stars} teamIds={groupTeams[d.group]} />
          ))}
        </div>
      </GlassCard>
      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-bold text-emerald-300">🍯 꿀조 TOP 3</h3>
        <div className="space-y-2">
          {easy.map((d) => (
            <GroupMiniRow key={d.group} group={d.group} avgOverall={d.avgOverall} stars={d.stars} teamIds={groupTeams[d.group]} />
          ))}
        </div>
      </GlassCard>
    </div>
  )
}
