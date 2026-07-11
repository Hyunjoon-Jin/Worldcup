import { useMemo } from 'react'
import { formatKoreanDate } from '../../data/calendar'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { UpsetBadge } from '../common/UpsetBadge'
import { GroupTable } from './GroupTable'
import { classifyMatchUpset } from '../../engine/matchEngine'
import { computeQualificationStatuses } from '../../engine/qualificationStatus'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useMatchDetailStore } from '../../store/useMatchDetailStore'
import { useCrisisTeams } from '../../store/useCrisisTeams'
import type { GroupLetter } from '../../types/group'

interface GroupDetailPageProps {
  group: GroupLetter
  onBack: () => void
}

export function GroupDetailPage({ group, onBack }: GroupDetailPageProps) {
  const drawGroups = useDrawStore((s) => s.state.groups)
  const { schedule, groupMatches } = useProgressStore()
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)

  const teamIds = (drawGroups[group] as (string | null)[]).filter(Boolean) as string[]
  const fixtures = (schedule?.groupMatches ?? []).filter((m) => m.group === group)
  const played = groupMatches.filter((m) => m.group === group)

  const groupTeams = useMemo(
    () =>
      Object.fromEntries(
        GROUP_LETTERS.map((g) => [g, (drawGroups[g] as (string | null)[]).filter(Boolean) as string[]]),
      ) as Record<GroupLetter, string[]>,
    [drawGroups],
  )
  const statusByTeam = useMemo(
    () => computeQualificationStatuses(groupTeams, groupMatches),
    [groupTeams, groupMatches],
  )
  const crisisByTeam = useCrisisTeams()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <GlassButton variant="ghost" onClick={onBack}>
          ← 전체 조 보기
        </GlassButton>
        <h2 className="font-display text-xl font-semibold tracking-wide text-white">GROUP {group}</h2>
      </div>

      <GlassCard className="p-4">
        <GroupTable teamIds={teamIds} matches={played} statusByTeam={statusByTeam} crisisByTeam={crisisByTeam} />
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-bold text-sky-300">경기 일정 및 결과</h3>
        <div className="space-y-2">
          {fixtures.map((fx) => {
            const homeId = drawGroups[group][fx.homeSeed - 1]
            const awayId = drawGroups[group][fx.awaySeed - 1]
            if (!homeId || !awayId) return null
            const result = played.find(
              (m) => m.matchday === fx.matchday && m.homeTeamId === homeId && m.awayTeamId === awayId,
            )
            const upsetInfo = result
              ? classifyMatchUpset(homeId, awayId, result.homeGoals, result.awayGoals)
              : null
            return (
              <div
                key={fx.id}
                onClick={() =>
                  selectMatch(
                    result
                      ? { kind: 'group', match: result, date: fx.date, timeSlot: fx.timeSlot }
                      : {
                          kind: 'upcoming',
                          homeTeamId: homeId,
                          awayTeamId: awayId,
                          label: `조별리그 MD${fx.matchday} · 조 ${group}`,
                          date: fx.date,
                          timeSlot: fx.timeSlot,
                        },
                  )
                }
                className={`flex cursor-pointer flex-col gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between ${
                  upsetInfo?.upset ? 'bg-red-500/10 ring-1 ring-red-400/30' : 'bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between sm:w-16 sm:shrink-0">
                  <span className="text-xs text-gray-400">
                    MD{fx.matchday} · {formatKoreanDate(fx.date)}
                  </span>
                  <span className="flex items-center gap-1.5 sm:hidden">
                    {upsetInfo && <UpsetBadge upset={upsetInfo.upset} surpriseDraw={upsetInfo.surpriseDraw} />}
                    <span className="text-xs text-gray-500">{result ? '종료' : '예정'}</span>
                  </span>
                </div>
                <div className="flex flex-1 items-center justify-center gap-3">
                  <TeamLink teamId={homeId} wrap className="min-w-0" />
                  {result ? (
                    <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 font-bold text-white">
                      {result.homeGoals} - {result.awayGoals}
                    </span>
                  ) : (
                    <span className="shrink-0 text-gray-500">vs</span>
                  )}
                  <TeamLink teamId={awayId} reverse wrap className="min-w-0" />
                </div>
                <span className="hidden shrink-0 items-center justify-end gap-1.5 sm:flex sm:w-24">
                  {upsetInfo && <UpsetBadge upset={upsetInfo.upset} surpriseDraw={upsetInfo.surpriseDraw} />}
                  <span className="text-xs text-gray-500">{result ? '종료' : '예정'}</span>
                </span>
              </div>
            )
          })}
        </div>
      </GlassCard>
    </div>
  )
}
