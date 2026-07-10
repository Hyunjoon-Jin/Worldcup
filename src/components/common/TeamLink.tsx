import { TEAMS_BY_ID } from '../../data/teams'
import { useSelectionStore } from '../../store/useSelectionStore'
import { FlagIcon } from './FlagIcon'

interface TeamLinkProps {
  teamId: string
  className?: string
  flagClassName?: string
  reverse?: boolean
}

export function TeamLink({ teamId, className = '', flagClassName = 'h-3 w-4', reverse = false }: TeamLinkProps) {
  const team = TEAMS_BY_ID[teamId]
  const selectTeam = useSelectionStore((s) => s.selectTeam)

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        selectTeam(teamId)
      }}
      className={`inline-flex min-w-0 items-center gap-1.5 text-left hover:underline hover:decoration-emerald-300/60 hover:underline-offset-2 ${
        reverse ? 'flex-row-reverse' : ''
      } ${className}`}
    >
      <FlagIcon iso2={team.iso2} className={`shrink-0 ${flagClassName}`} />
      <span className="truncate">{team.nameKo}</span>
    </button>
  )
}
