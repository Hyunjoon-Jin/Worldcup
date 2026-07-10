import { useEffect } from 'react'
import { TEAMS_BY_ID } from '../../data/teams'
import { FlagIcon } from '../common/FlagIcon'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { CalendarTimeline } from './CalendarTimeline'
import { DayResultFeed } from './DayResultFeed'
import { useProgressStore } from '../../store/useProgressStore'
import type { KnockoutRound } from '../../types/match'

const ROUND_ORDER: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL']

export function ScheduleStage() {
  const { schedule, phase, currentDay, knockoutSlots, initSchedule, advanceDay, champion } = useProgressStore()

  useEffect(() => {
    initSchedule()
  }, [initSchedule])

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
        <div className="mt-4">
          {phase !== 'complete' ? (
            <GlassButton onClick={advanceDay}>▶ 다음 날 진행</GlassButton>
          ) : (
            <p className="text-lg font-bold text-amber-300">🎉 우승팀이 결정되었습니다!</p>
          )}
        </div>
      </GlassCard>

      <DayResultFeed />
      {champion && (
        <GlassCard strong className="p-6 text-center">
          <p className="text-sm text-gray-300">2026 북중미 월드컵 우승</p>
          <p className="mt-1 flex items-center justify-center gap-3 text-2xl font-extrabold text-amber-300">
            🏆 <FlagIcon iso2={TEAMS_BY_ID[champion].iso2} className="h-6 w-9" /> {TEAMS_BY_ID[champion].nameKo}
          </p>
        </GlassCard>
      )}
    </div>
  )
}
