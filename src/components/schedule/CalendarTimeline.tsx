import { dateForGroupStageDay, formatKoreanDate, ROUND_DATE_WINDOWS } from '../../data/calendar'
import type { KnockoutRound } from '../../types/match'

interface CalendarTimelineProps {
  phase: 'group' | 'knockout' | 'complete'
  currentDay: number
  totalGroupStageDays: number
  currentKnockoutRound: KnockoutRound | null
}

const KNOCKOUT_ORDER: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL']

export function CalendarTimeline({ phase, currentDay, totalGroupStageDays, currentKnockoutRound }: CalendarTimelineProps) {
  return (
    <div className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-2">
      {Array.from({ length: totalGroupStageDays }, (_, i) => i + 1).map((day) => {
        const isDone = phase !== 'group' || day < currentDay
        const isNow = phase === 'group' && day === currentDay
        return (
          <div
            key={day}
            className={`flex shrink-0 flex-col items-center rounded-lg px-2 py-1.5 text-[10px] ${
              isNow ? 'glass-strong ring-1 ring-emerald-300/70' : isDone ? 'bg-white/10 text-gray-400' : 'bg-white/[0.03] text-gray-600'
            }`}
          >
            <span className="font-bold">D{day}</span>
            <span>{formatKoreanDate(dateForGroupStageDay(day))}</span>
          </div>
        )
      })}
      <div className="mx-1 my-auto h-6 w-px shrink-0 bg-white/15" />
      {KNOCKOUT_ORDER.map((round) => {
        const isNow = phase !== 'group' && currentKnockoutRound === round
        const isDone =
          phase === 'complete' ||
          (currentKnockoutRound !== null && KNOCKOUT_ORDER.indexOf(round) < KNOCKOUT_ORDER.indexOf(currentKnockoutRound))
        return (
          <div
            key={round}
            className={`flex shrink-0 flex-col items-center rounded-lg px-2 py-1.5 text-[10px] ${
              isNow ? 'glass-strong ring-1 ring-amber-300/70' : isDone ? 'bg-white/10 text-gray-400' : 'bg-white/[0.03] text-gray-600'
            }`}
          >
            <span className="font-bold">{ROUND_DATE_WINDOWS[round].label}</span>
            <span>{formatKoreanDate(ROUND_DATE_WINDOWS[round].start)}</span>
          </div>
        )
      })}
    </div>
  )
}
