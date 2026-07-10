import { useEffect, useMemo } from 'react'
import { TEAMS_BY_ID } from '../../data/teams'
import { formatKoreanDate } from '../../data/calendar'
import { FlagIcon } from '../common/FlagIcon'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { CalendarTimeline } from './CalendarTimeline'
import { DayResultFeed } from './DayResultFeed'
import { nextPendingGroupSlot, nextPendingKnockoutSlot, useProgressStore } from '../../store/useProgressStore'
import type { KnockoutRound } from '../../types/match'

const ROUND_ORDER: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL']

export function ScheduleStage() {
  const { schedule, phase, currentDay, groupMatches, knockoutSlots, initSchedule, advanceDay, advanceTimeSlot, champion } =
    useProgressStore()

  useEffect(() => {
    initSchedule()
  }, [initSchedule])

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

      <DayResultFeed />
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
