import { TEAMS_BY_ID } from '../../data/teams'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { GlassCard } from '../common/GlassCard'
import { FlagIcon } from '../common/FlagIcon'
import type { GroupSlots } from '../../engine/drawEngine'

interface GroupBoardProps {
  groups: GroupSlots
  highlightGroup?: string | null
}

export function GroupBoard({ groups, highlightGroup }: GroupBoardProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {GROUP_LETTERS.map((letter) => (
        <GlassCard
          key={letter}
          className={`p-3 transition-all ${highlightGroup === letter ? 'ring-2 ring-emerald-300/70' : ''}`}
        >
          <div className="mb-2 text-xs font-bold tracking-wide text-emerald-300/90">GROUP {letter}</div>
          <ul className="space-y-1.5">
            {groups[letter].map((teamId, idx) => {
              const team = teamId ? TEAMS_BY_ID[teamId] : null
              return (
                <li
                  key={idx}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${
                    team ? 'bg-white/5' : 'bg-white/[0.02] text-gray-500 italic'
                  }`}
                >
                  {team ? (
                    <>
                      <FlagIcon iso2={team.iso2} className="h-3 w-4" />
                      <span className="truncate text-gray-100">{team.nameKo}</span>
                    </>
                  ) : (
                    <span>포트 {idx + 1} 대기 중</span>
                  )}
                </li>
              )
            })}
          </ul>
        </GlassCard>
      ))}
    </div>
  )
}
