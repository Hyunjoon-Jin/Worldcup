import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { rankGroupTeams, rankThirdPlaceTeams } from '../../engine/tiebreakers'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { TEAMS_BY_ID } from '../../data/teams'
import type { QualificationStatus } from '../../engine/qualificationStatus'
import type { GroupLetter } from '../../types/group'
import type { GroupMatch } from '../../types/match'

interface ThirdPlaceTableProps {
  groupTeams: Record<GroupLetter, string[]>
  matches: GroupMatch[]
  statusByTeam: Record<string, QualificationStatus>
}

function StatusCell({ status }: { status?: QualificationStatus }) {
  if (status === 'advancing') return <span className="text-xs font-bold text-emerald-300">✅ 확정 진출</span>
  if (status === 'eliminated') return <span className="text-xs font-bold text-gray-500">❌ 확정 탈락</span>
  return <span className="text-xs text-amber-300/80">⏳ 진행중</span>
}

export function ThirdPlaceTable({ groupTeams, matches, statusByTeam }: ThirdPlaceTableProps) {
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
      <h3 className="font-display mb-3 text-base font-semibold tracking-wide text-amber-300">3위팀 순위표 — 상위 8팀 32강 진출</h3>
      <p className="mb-3 text-[11px] text-gray-500">
        "순위"는 현재까지 결과 기준 잠정 순위이며, "진출 여부"는 남은 모든 조가 끝난 이후에도 결과가 절대
        바뀌지 않는 경우에만 확정으로 표시합니다.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead>
            <tr className="text-gray-400">
              <th className="w-6 py-1"></th>
              <th className="py-1">국가</th>
              <th className="hidden w-12 py-1 text-center sm:table-cell">FIFA</th>
              <th className="w-8 py-1 text-center">조</th>
              <th className="w-10 py-1 text-center">득실</th>
              <th className="w-8 py-1 text-center">승점</th>
              <th className="w-20 py-1 text-center">진출 여부</th>
              <th className="hidden w-16 py-1 text-center sm:table-cell">득점차</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => {
              const s = entry.standing
              const gd = s.goalsFor - s.goalsAgainst
              const status = statusByTeam[entry.teamId]
              return (
                <tr
                  key={entry.teamId}
                  className={`border-t border-white/5 ${entry.qualified ? 'bg-emerald-400/[0.06]' : 'opacity-70'}`}
                >
                  <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                  <td className="py-1.5">
                    <TeamLink teamId={entry.teamId} wrap className="min-w-0 font-medium text-gray-100" />
                  </td>
                  <td className="hidden text-center text-gray-500 sm:table-cell">
                    {TEAMS_BY_ID[entry.teamId].fifaRankApprox}위
                  </td>
                  <td className="text-center text-gray-300">{entry.group}</td>
                  <td className="text-center text-gray-300">{gd > 0 ? `+${gd}` : gd}</td>
                  <td className="text-center text-base font-bold text-white">{s.points}</td>
                  <td className="text-center">
                    <StatusCell status={status} />
                  </td>
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
