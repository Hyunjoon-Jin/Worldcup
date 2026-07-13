import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { useSelectionStore } from '../../store/useSelectionStore'
import { FlagIcon } from './FlagIcon'

interface TeamLinkProps {
  teamId: string
  className?: string
  flagClassName?: string
  reverse?: boolean
  /** 긴 국가명(보스니아 헤르체고비나 등)이 말줄임표로 잘리지 않고 줄바꿈되도록 허용 */
  wrap?: boolean
}

export function TeamLink({
  teamId,
  className = '',
  flagClassName = 'h-3 w-4',
  reverse = false,
  wrap = false,
}: TeamLinkProps) {
  const team = ALL_NATIONS_BY_ID[teamId]
  const selectTeam = useSelectionStore((s) => s.selectTeam)

  if (!team) return <span className={className}>{teamId}</span>

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
      <span className={wrap ? 'break-keep' : 'truncate'}>{team.nameKo}</span>
    </button>
  )
}
