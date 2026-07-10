import { TeamLink } from '../common/TeamLink'
import { computeStandings, rankGroupTeams } from '../../engine/tiebreakers'
import type { GroupMatch } from '../../types/match'
import type { QualificationStatus } from '../../engine/qualificationStatus'

interface GroupTableProps {
  teamIds: string[]
  matches: GroupMatch[]
  delta?: Record<string, number>
  qualifyLine?: number
  compact?: boolean
  statusByTeam?: Record<string, QualificationStatus>
}

function DeltaArrow({ value }: { value: number }) {
  if (!value) return <span className="text-gray-600">–</span>
  if (value > 0) return <span className="font-bold text-emerald-400">▲{value}</span>
  return <span className="font-bold text-red-400">▼{Math.abs(value)}</span>
}

function StatusBadge({ status }: { status?: QualificationStatus }) {
  if (status === 'advancing') {
    return <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">진출확정</span>
  }
  if (status === 'eliminated') {
    return <span className="rounded bg-gray-500/20 px-1.5 py-0.5 text-[9px] font-bold text-gray-400">탈락확정</span>
  }
  return null
}

export function GroupTable({ teamIds, matches, delta, qualifyLine = 2, compact = false, statusByTeam }: GroupTableProps) {
  const standings = computeStandings(teamIds, matches)
  const order = rankGroupTeams(teamIds, matches)

  return (
    <div className={compact ? '' : 'overflow-x-auto'}>
      <table className={`w-full text-left text-xs sm:text-sm ${compact ? '' : 'min-w-[420px]'}`}>
        <thead>
          <tr className="text-gray-400">
            <th className="w-6 py-1"></th>
            <th className="py-1">국가</th>
            {!compact && (
              <>
                <th className="w-8 py-1 text-center">경기</th>
                <th className="w-8 py-1 text-center">승</th>
                <th className="w-8 py-1 text-center">무</th>
                <th className="w-8 py-1 text-center">패</th>
              </>
            )}
            <th className="w-10 py-1 text-center">득실</th>
            <th className="w-8 py-1 text-center">승점</th>
            {delta && <th className="w-10 py-1 text-center">변동</th>}
          </tr>
        </thead>
        <tbody>
          {order.map((teamId, idx) => {
            const s = standings[teamId]
            const gd = s.goalsFor - s.goalsAgainst
            const status = statusByTeam?.[teamId]
            return (
              <tr
                key={teamId}
                className={`border-t border-white/5 ${idx < qualifyLine ? 'bg-emerald-400/[0.06]' : ''}`}
              >
                <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                <td className="py-1.5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <TeamLink teamId={teamId} className="font-medium text-gray-100" />
                    <StatusBadge status={status} />
                  </div>
                </td>
                {!compact && (
                  <>
                    <td className="text-center text-gray-300">{s.played}</td>
                    <td className="text-center text-gray-300">{s.win}</td>
                    <td className="text-center text-gray-300">{s.draw}</td>
                    <td className="text-center text-gray-300">{s.loss}</td>
                  </>
                )}
                <td className="text-center text-gray-300">
                  {gd > 0 ? `+${gd}` : gd}
                  {!compact && ` (${s.goalsFor}-${s.goalsAgainst})`}
                </td>
                <td className="text-center text-base font-bold text-white">{s.points}</td>
                {delta && (
                  <td className="text-center">
                    <DeltaArrow value={delta[teamId] ?? 0} />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
