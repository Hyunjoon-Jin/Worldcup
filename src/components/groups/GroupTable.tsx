import { TeamLink } from '../common/TeamLink'
import { TEAMS_BY_ID } from '../../data/teams'
import { computeStandings, rankGroupTeams } from '../../engine/tiebreakers'
import type { GroupMatch } from '../../types/match'
import type { QualificationStatus } from '../../engine/qualificationStatus'
import type { CrisisInfo } from '../../store/useCrisisTeams'

interface GroupTableProps {
  teamIds: string[]
  matches: GroupMatch[]
  delta?: Record<string, number>
  qualifyLine?: number
  compact?: boolean
  statusByTeam?: Record<string, QualificationStatus>
  crisisByTeam?: Record<string, CrisisInfo>
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

function CrisisBadge({ crisis }: { crisis?: CrisisInfo }) {
  if (!crisis) return null
  return (
    <span
      className="rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-300"
      title={`32강 진출 확률 ${crisis.pct.toFixed(1)}% (50% 미만)`}
    >
      🚨 위기
    </span>
  )
}

export function GroupTable({
  teamIds,
  matches,
  delta,
  qualifyLine = 2,
  compact = false,
  statusByTeam,
  crisisByTeam,
}: GroupTableProps) {
  const standings = computeStandings(teamIds, matches)
  const order = rankGroupTeams(teamIds, matches)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs sm:text-sm">
        <thead>
          <tr className="text-gray-400">
            <th className="w-6 py-1"></th>
            <th className="py-1">국가</th>
            <th className="w-8 py-1 text-center">경기</th>
            {!compact && (
              <>
                <th className="hidden w-8 py-1 text-center sm:table-cell">승</th>
                <th className="hidden w-8 py-1 text-center sm:table-cell">무</th>
                <th className="hidden w-8 py-1 text-center sm:table-cell">패</th>
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
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <TeamLink teamId={teamId} wrap className="min-w-0 font-medium text-gray-100" />
                    {!compact && (
                      <span className="hidden text-[10px] text-gray-500 sm:inline">
                        FIFA {TEAMS_BY_ID[teamId].fifaRankApprox}위
                      </span>
                    )}
                    <StatusBadge status={status} />
                    <CrisisBadge crisis={crisisByTeam?.[teamId]} />
                  </div>
                </td>
                <td className="text-center text-gray-300">{s.played}</td>
                {!compact && (
                  <>
                    <td className="hidden text-center text-gray-300 sm:table-cell">{s.win}</td>
                    <td className="hidden text-center text-gray-300 sm:table-cell">{s.draw}</td>
                    <td className="hidden text-center text-gray-300 sm:table-cell">{s.loss}</td>
                  </>
                )}
                <td className="text-center text-gray-300">
                  {gd > 0 ? `+${gd}` : gd}
                  {!compact && <span className="hidden sm:inline"> ({s.goalsFor}-{s.goalsAgainst})</span>}
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
