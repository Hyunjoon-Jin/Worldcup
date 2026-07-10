import { TeamLink } from '../common/TeamLink'
import { UpsetBadge } from '../common/UpsetBadge'
import { isUpset } from '../../engine/matchEngine'
import type { KnockoutSlotState } from '../../engine/tournamentSimulation'

interface MatchNodeProps {
  slot: KnockoutSlotState
}

function TeamRow({ teamId, isWinner, goals }: { teamId: string | null; isWinner: boolean; goals?: number }) {
  return (
    <div className={`flex items-center justify-between gap-2 px-2 py-1 ${isWinner ? 'font-bold text-white' : 'text-gray-300'}`}>
      {teamId ? (
        <TeamLink teamId={teamId} />
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="h-3 w-4 shrink-0 rounded-[2px] bg-white/10" />
          <span className="truncate">TBD</span>
        </span>
      )}
      {goals !== undefined && <span className="shrink-0 tabular-nums">{goals}</span>}
    </div>
  )
}

export function MatchNode({ slot }: MatchNodeProps) {
  const result = slot.result
  const loserTeamId = result ? (result.winnerTeamId === result.homeTeamId ? result.awayTeamId : result.homeTeamId) : null
  const upset = result && loserTeamId ? isUpset(result.winnerTeamId, loserTeamId) : false

  return (
    <div className={`glass w-44 shrink-0 rounded-xl py-1 text-xs sm:w-52 ${upset ? 'ring-1 ring-red-400/40' : ''}`}>
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
      {(result?.wentToPenalties || upset) && (
        <div className="flex items-center justify-center gap-1 pb-0.5 text-center text-[9px] text-gray-500">
          {result?.wentToPenalties && <span>승부차기</span>}
          {upset && <UpsetBadge upset className="text-[9px]" />}
        </div>
      )}
    </div>
  )
}
