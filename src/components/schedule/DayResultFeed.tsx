import { useMemo } from 'react'
import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../../data/nations'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { formatKoreanDate } from '../../data/calendar'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { UpsetBadge } from '../common/UpsetBadge'
import { GroupTable } from '../groups/GroupTable'
import { classifyMatchUpset, isUpset } from '../../engine/matchEngine'
import { computeQualificationStatuses } from '../../engine/qualificationStatus'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useMatchDetailStore } from '../../store/useMatchDetailStore'
import { useCrisisTeams } from '../../store/useCrisisTeams'
import type { GroupLetter } from '../../types/group'

const ROUND_LABEL_KO: Record<string, string> = {
  R32: '32강',
  R16: '16강',
  QF: '8강',
  SF: '4강',
  THIRD: '3·4위전',
  FINAL: '결승',
}

export function DayResultFeed() {
  const drawGroups = useDrawStore((s) => s.state.groups)
  const { lastDayGroupResults, lastDeltaByGroup, groupMatches, lastKnockoutResults, lastBatchDate, lastBatchTimeSlot, phase } =
    useProgressStore()
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)

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

  const hasGroupResults = lastDayGroupResults.length > 0
  const hasKnockoutResults = lastKnockoutResults.length > 0

  if (!hasGroupResults && !hasKnockoutResults) {
    return (
      <GlassCard className="p-4 text-center text-sm text-gray-400">
        아직 진행된 경기가 없습니다. "다음 시간대 진행" 또는 "다음 날 전체 진행"을 눌러 시작하세요.
      </GlassCard>
    )
  }

  const touchedGroups = Array.from(new Set(lastDayGroupResults.map((m) => m.group))) as GroupLetter[]
  const batchLabel = lastBatchDate
    ? `${formatKoreanDate(lastBatchDate)}${lastBatchTimeSlot ? ` ${lastBatchTimeSlot}` : ''} 결과`
    : '오늘의 결과'

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-bold text-emerald-300">
          {phase === 'complete' ? `🏆 대회 종료 — ${batchLabel}` : batchLabel}
        </h3>
        <div className={hasGroupResults && touchedGroups.length > 0 ? 'mb-4 space-y-1.5' : 'space-y-1.5'}>
          {lastDayGroupResults.map((m, i) => {
            const { upset, surpriseDraw } = classifyMatchUpset(m.homeTeamId, m.awayTeamId, m.homeGoals, m.awayGoals)
            return (
              <div
                key={`group-${i}`}
                onClick={() =>
                  selectMatch({
                    kind: 'group',
                    match: m,
                    date: lastBatchDate ?? undefined,
                    timeSlot: lastBatchTimeSlot ?? undefined,
                  })
                }
                className={`flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between ${
                  upset ? 'bg-red-500/10 ring-1 ring-red-400/30' : 'bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between sm:w-10 sm:shrink-0">
                  <span className="text-xs text-gray-500">조{m.group}</span>
                  <span className="sm:hidden">
                    <UpsetBadge upset={upset} surpriseDraw={surpriseDraw} />
                  </span>
                </div>
                <span className="flex flex-1 items-center justify-center gap-2">
                  <TeamLink teamId={m.homeTeamId} wrap className="min-w-0" />
                  <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 font-bold text-white">
                    {m.homeGoals} - {m.awayGoals}
                  </span>
                  <TeamLink teamId={m.awayTeamId} reverse wrap className="min-w-0" />
                </span>
                <span className="hidden w-16 shrink-0 text-right sm:block">
                  <UpsetBadge upset={upset} surpriseDraw={surpriseDraw} />
                </span>
              </div>
            )
          })}
          {lastKnockoutResults.map((m, i) => {
            const loserTeamId = m.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId
            const isUpsetResult = isUpset(m.winnerTeamId, loserTeamId)
            return (
              <div
                key={`ko-${i}`}
                onClick={() =>
                  selectMatch({
                    kind: 'knockout',
                    match: m,
                    date: lastBatchDate ?? undefined,
                    timeSlot: lastBatchTimeSlot ?? undefined,
                  })
                }
                className={`flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between ${
                  isUpsetResult ? 'bg-red-500/10 ring-1 ring-red-400/30' : 'bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between sm:w-14 sm:shrink-0">
                  <span className="text-xs text-gray-500">{ROUND_LABEL_KO[m.round]}</span>
                  <span className="flex items-center gap-1.5 sm:hidden">
                    <UpsetBadge upset={isUpsetResult} />
                    <span className="text-xs font-bold text-emerald-300">{TEAMS_BY_ID[m.winnerTeamId].nameKo} 승</span>
                  </span>
                </div>
                <span className="flex flex-1 items-center justify-center gap-2">
                  <TeamLink teamId={m.homeTeamId} wrap className="min-w-0" />
                  <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 font-bold text-white">
                    {m.homeGoals} - {m.awayGoals}
                  </span>
                  <TeamLink teamId={m.awayTeamId} reverse wrap className="min-w-0" />
                  {m.wentToPenalties && <span className="text-[10px] text-gray-500">(승부차기)</span>}
                </span>
                <span className="hidden w-24 shrink-0 items-center justify-end gap-1.5 sm:flex">
                  <UpsetBadge upset={isUpsetResult} />
                  <span className="text-xs font-bold text-emerald-300">{TEAMS_BY_ID[m.winnerTeamId].nameKo} 승</span>
                </span>
              </div>
            )
          })}
        </div>

        {hasGroupResults && touchedGroups.length > 0 && (
          <>
            <h4 className="mb-2 text-xs font-bold text-gray-400">순위 변동 (해당 조)</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {touchedGroups.map((group) => (
                <div key={group} className="rounded-lg bg-white/[0.03] p-2">
                  <div className="font-display mb-1 text-sm font-semibold tracking-wide text-sky-300">GROUP {group}</div>
                  <GroupTable
                    teamIds={groupTeams[group]}
                    matches={groupMatches.filter((m) => m.group === group)}
                    delta={lastDeltaByGroup[group]}
                    statusByTeam={statusByTeam}
                    crisisByTeam={crisisByTeam}
                    compact
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </GlassCard>
    </div>
  )
}
