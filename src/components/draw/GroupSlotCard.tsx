import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../../data/nations'
import { GlassCard } from '../common/GlassCard'
import { FlagIcon } from '../common/FlagIcon'

interface GroupSlotCardProps {
  letter: string
  teams: (string | null)[]
  highlight?: boolean
  className?: string
}

export function GroupSlotCard({ letter, teams, highlight = false, className = '' }: GroupSlotCardProps) {
  return (
    <GlassCard className={`p-3 transition-all ${highlight ? 'ring-2 ring-emerald-300/70' : ''} ${className}`}>
      <div className="font-display mb-2 text-sm font-semibold tracking-wide text-emerald-300/90">GROUP {letter}</div>
      <ul className="space-y-1.5">
        {teams.map((teamId, idx) => {
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
  )
}
