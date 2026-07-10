import { TEAMS_BY_ID } from '../../data/teams'
import { FlagIcon } from '../common/FlagIcon'
import { GlassCard } from '../common/GlassCard'
import { rankGroupTeams, rankThirdPlaceTeams } from '../../engine/tiebreakers'
import { GROUP_LETTERS } from '../../data/hostSlots'
import type { GroupLetter } from '../../types/group'
import type { GroupMatch } from '../../types/match'

interface ThirdPlaceTableProps {
  groupTeams: Record<GroupLetter, string[]>
  matches: GroupMatch[]
}

export function ThirdPlaceTable({ groupTeams, matches }: ThirdPlaceTableProps) {
  const thirdByGroup: Partial<Record<GroupLetter, string>> = {}
  for (const group of GROUP_LETTERS) {
    const teamIds = groupTeams[group]
    if (!teamIds || teamIds.length < 4) continue
    const groupMatches = matches.filter((m) => m.group === group)
    const order = rankGroupTeams(teamIds, groupMatches)
    thirdByGroup[group] = order[2]
  }

  const entries = rankThirdPlaceTeams(thirdByGroup, matches)

  if (entries.length === 0) {
    return <GlassCard className="p-4 text-center text-sm text-gray-400">조추첨이 완료되면 3위팀 순위표가 표시됩니다.</GlassCard>
  }

  return (
    <GlassCard className="p-4">
      <h3 className="mb-3 text-sm font-bold text-amber-300">3위팀 순위표 — 상위 8팀 32강 진출</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead>
            <tr className="text-gray-400">
              <th className="w-6 py-1"></th>
              <th className="py-1">국가</th>
              <th className="w-8 py-1 text-center">조</th>
              <th className="w-10 py-1 text-center">득실</th>
              <th className="w-8 py-1 text-center">승점</th>
              <th className="w-10 py-1 text-center">진출</th>
              <th className="hidden w-16 py-1 text-center sm:table-cell">득점차</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => {
              const team = TEAMS_BY_ID[entry.teamId]
              const s = entry.standing
              const gd = s.goalsFor - s.goalsAgainst
              return (
                <tr
                  key={entry.teamId}
                  className={`border-t border-white/5 ${entry.qualified ? 'bg-emerald-400/[0.06]' : 'opacity-50'}`}
                >
                  <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                  <td className="py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <FlagIcon iso2={team.iso2} className="h-3 w-4 shrink-0" />
                      <span className="truncate font-medium text-gray-100">{team.nameKo}</span>
                    </div>
                  </td>
                  <td className="text-center text-gray-300">{entry.group}</td>
                  <td className="text-center text-gray-300">{gd > 0 ? `+${gd}` : gd}</td>
                  <td className="text-center text-base font-bold text-white">{s.points}</td>
                  <td className="text-center">{entry.qualified ? '✅' : '❌'}</td>
                  <td className="hidden text-center text-gray-300 sm:table-cell">
                    {s.goalsFor}-{s.goalsAgainst}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}
