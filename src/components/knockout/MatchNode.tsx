import { TEAMS_BY_ID } from '../../data/teams'
import { FlagIcon } from '../common/FlagIcon'
import type { KnockoutSlotState } from '../../engine/tournamentSimulation'

interface MatchNodeProps {
  slot: KnockoutSlotState
}

function TeamRow({ teamId, isWinner, goals }: { teamId: string | null; isWinner: boolean; goals?: number }) {
  const team = teamId ? TEAMS_BY_ID[teamId] : null
  return (
    <div className={`flex items-center justify-between gap-2 px-2 py-1 ${isWinner ? 'font-bold text-white' : 'text-gray-300'}`}>
      <span className="flex min-w-0 items-center gap-1.5">
        {team ? <FlagIcon iso2={team.iso2} className="h-3 w-4 shrink-0" /> : <span className="h-3 w-4 shrink-0 rounded-[2px] bg-white/10" />}
        <span className="truncate">{team ? team.nameKo : 'TBD'}</span>
      </span>
      {goals !== undefined && <span className="shrink-0 tabular-nums">{goals}</span>}
    </div>
  )
}

export function MatchNode({ slot }: MatchNodeProps) {
  const result = slot.result
  return (
    <div className="glass w-44 shrink-0 rounded-xl py-1 text-xs sm:w-52">
      <TeamRow
        teamId={slot.team1Id}
        isWinner={!!result && result.winnerTeamId === slot.team1Id}
        goals={result?.homeGoals}
      />
      <div className="mx-2 h-px bg-white/10" />
      <TeamRow
        teamId={slot.team2Id}
        isWinner={!!result && result.winnerTeamId === slot.team2Id}
        goals={result?.awayGoals}
      />
      {result?.wentToPenalties && <div className="pb-0.5 text-center text-[9px] text-gray-500">승부차기</div>}
    </div>
  )
}
