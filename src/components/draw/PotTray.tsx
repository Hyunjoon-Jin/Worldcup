import { getTeamsByPot } from '../../data/teams'
import { GlassCard } from '../common/GlassCard'
import { FlagIcon } from '../common/FlagIcon'
import type { PotPools } from '../../engine/drawEngine'
import type { Pot } from '../../types/team'

interface PotTrayProps {
  pots: PotPools
  currentPot: Pot | null
}

const POT_LABEL: Record<Pot, string> = { 1: '포트 1', 2: '포트 2', 3: '포트 3', 4: '포트 4' }

export function PotTray({ pots, currentPot }: PotTrayProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {([1, 2, 3, 4] as Pot[]).map((pot) => {
        const allTeams = getTeamsByPot(pot)
        const remainingIds = new Set(pots[pot])
        return (
          <GlassCard key={pot} className={`p-3 ${currentPot === pot ? 'ring-2 ring-sky-300/70' : ''}`}>
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-sky-300/90">
              <span>{POT_LABEL[pot]}</span>
              <span className="text-gray-400">{pots[pot].length}팀 남음</span>
            </div>
            <ul className="space-y-1">
              {allTeams.map((team) => {
                const remaining = remainingIds.has(team.id) || team.isHost
                return (
                  <li
                    key={team.id}
                    className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] ${
                      remaining ? 'text-gray-100' : 'text-gray-600 line-through opacity-40'
                    }`}
                  >
                    <FlagIcon iso2={team.iso2} className="h-2.5 w-3.5" />
                    <span className="truncate">{team.nameKo}</span>
                    {team.isHost && <span className="ml-auto text-[9px] text-amber-300">개최국</span>}
                  </li>
                )
              })}
            </ul>
          </GlassCard>
        )
      })}
    </div>
  )
}
