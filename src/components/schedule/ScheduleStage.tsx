import { useEffect, useMemo } from 'react'
import { TEAMS_BY_ID } from '../../data/teams'
import { formatKoreanDate } from '../../data/calendar'
import { FlagIcon } from '../common/FlagIcon'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { CalendarTimeline } from './CalendarTimeline'
import { DayResultFeed } from './DayResultFeed'
import { TournamentSummary } from './TournamentSummary'
import { nextPendingGroupSlot, nextPendingKnockoutSlot, useProgressStore } from '../../store/useProgressStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import type { KnockoutRound } from '../../types/match'

const ROUND_ORDER: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL']
const MEDALS = ['🥇', '🥈', '🥉']

export function ScheduleStage() {
  const { schedule, phase, currentDay, groupMatches, knockoutSlots, initSchedule, advanceDay, advanceTimeSlot, advanceToEnd, champion } =
    useProgressStore()
  const simResult = useSimulationStore((s) => s.result)
  const runSimulation = useSimulationStore((s) => s.run)

  useEffect(() => {
    initSchedule()
  }, [initSchedule])

  useEffect(() => {
    if (!simResult) runSimulation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const top3Champion = useMemo(() => {
    if (!simResult) return []
    return Object.values(simResult.probabilities)
      .slice()
      .sort((a, b) => b.championPct - a.championPct)
      .slice(0, 3)
  }, [simResult])

  const nextSlotPreview = useMemo(() => {
    if (!schedule) return null
    if (phase === 'group' || phase === 'idle') {
      const pending = nextPendingGroupSlot(schedule, groupMatches, currentDay)
      return pending ? { date: pending.fixtures[0]?.date, timeSlot: pending.timeSlot, count: pending.fixtures.length } : null
    }
    if (phase === 'knockout') {
      const pending = nextPendingKnockoutSlot(schedule, knockoutSlots)
      return pending ? { date: pending.date, timeSlot: pending.timeSlot, count: pending.fixtures.length } : null
    }
    return null
  }, [schedule, phase, groupMatches, currentDay, knockoutSlots])

  if (!schedule) return null

  const currentKnockoutRound: KnockoutRound | null =
    phase === 'group'
      ? null
      : ROUND_ORDER.find((round) =>
          Object.values(knockoutSlots).some((slot) => slot.round === round && slot.team1Id && !slot.result),
        ) ?? null

  const statusText =
    phase === 'group'
      ? `그룹스테이지 진행 중 — Day ${currentDay} / ${schedule.totalGroupStageDays}`
      : phase === 'complete'
        ? '🏆 대회 종료'
        : `토너먼트 진행 중 — ${currentKnockoutRound ?? ''}`

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-3 text-sm font-semibold text-white">{statusText}</p>
        <CalendarTimeline
          phase={phase === 'idle' ? 'group' : phase}
          currentDay={currentDay}
          totalGroupStageDays={schedule.totalGroupStageDays}
          currentKnockoutRound={currentKnockoutRound}
        />
        <div className="mt-4 flex flex-col items-center gap-2">
          {phase !== 'complete' ? (
            <>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <GlassButton onClick={advanceTimeSlot} disabled={!nextSlotPreview}>
                  ⏱ 다음 시간대 진행{nextSlotPreview && ` (${nextSlotPreview.timeSlot})`}
                </GlassButton>
                <GlassButton variant="ghost" onClick={advanceDay}>
                  ▶ 다음 날 전체 진행
                </GlassButton>
                <GlassButton variant="ghost" onClick={advanceToEnd} disabled={!nextSlotPreview}>
                  ⏭ 결승까지 자동 진행
                </GlassButton>
              </div>
              {nextSlotPreview?.date && (
                <p className="text-[11px] text-gray-500">
                  다음 경기: {formatKoreanDate(nextSlotPreview.date)} {nextSlotPreview.timeSlot} 현지시간 ·{' '}
                  {nextSlotPreview.count}경기
                </p>
              )}
            </>
          ) : (
            <p className="text-lg font-bold text-amber-300">🎉 우승팀이 결정되었습니다!</p>
          )}
        </div>
      </GlassCard>

      {phase !== 'complete' && top3Champion.length > 0 && (
        <GlassCard className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <h3 className="shrink-0 text-xs font-bold whitespace-nowrap text-amber-300">🏆 실시간 우승 확률 TOP 3</h3>
          <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
            {top3Champion.map((row, idx) => (
              <div key={row.teamId} className="flex items-center gap-1.5">
                <span className="text-sm">{MEDALS[idx]}</span>
                <TeamLink teamId={row.teamId} className="text-xs font-medium text-gray-100" />
                <span className="text-xs font-bold tabular-nums text-amber-300">{row.championPct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <DayResultFeed />
      <TournamentSummary />
      {champion && (
        <GlassCard strong className="p-6 text-center">
          <p className="text-sm text-gray-300">2026 북중미 월드컵 우승</p>
          <p className="font-display mt-1 flex items-center justify-center gap-3 text-3xl font-semibold tracking-wide text-amber-300">
            🏆 <FlagIcon iso2={TEAMS_BY_ID[champion].iso2} className="h-6 w-9" /> {TEAMS_BY_ID[champion].nameKo}
          </p>
        </GlassCard>
      )}
    </div>
  )
}
