import { useEffect, useMemo, useRef, useState } from 'react'
import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../../data/nations'
import { FINAL_SLOT_ID, THIRD_SLOT_ID } from '../../data/bracketTemplate'
import { useDrawStore } from '../../store/useDrawStore'
import { useSoundStore } from '../../store/useSoundStore'
import { marginOfError95 } from '../../engine/confidence'
import { playClick, playVictory } from '../../engine/sound'
import { formatKoreanDate } from '../../data/calendar'
import { FlagIcon } from '../common/FlagIcon'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { CalendarTimeline } from './CalendarTimeline'
import { DayResultFeed } from './DayResultFeed'
import { TournamentSummary } from './TournamentSummary'
import { SaveSlotsPanel } from './SaveSlotsPanel'
import { VenueMap } from './VenueMap'
import { nextPendingGroupSlot, nextPendingKnockoutSlot, useProgressStore } from '../../store/useProgressStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import { useCareerStore } from '../../store/useCareerStore'
import type { KnockoutRound } from '../../types/match'

const ROUND_ORDER: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL']
const MEDALS = ['🥇', '🥈', '🥉']

export function ScheduleStage({ onNextEdition }: { onNextEdition?: () => void }) {
  const { schedule, phase, currentDay, groupMatches, knockoutSlots, initSchedule, advanceDay, advanceTimeSlot, advanceToEnd, champion } =
    useProgressStore()
  const simResult = useSimulationStore((s) => s.result)
  const simIterations = useSimulationStore((s) => s.iterations)
  const runSimulation = useSimulationStore((s) => s.run)
  const seed = useDrawStore((s) => s.seed)
  const soundEnabled = useSoundStore((s) => s.enabled)
  const editionYear = useCareerStore((s) => s.year)
  const editionHosts = useCareerStore((s) => s.hostIds)
  const [shared, setShared] = useState(false)

  // 우승팀이 결정되는 순간 팡파레 (v2 #49)
  const prevChampion = useRef<string | null>(null)
  useEffect(() => {
    if (champion && champion !== prevChampion.current && soundEnabled) playVictory()
    prevChampion.current = champion
  }, [champion, soundEnabled])

  // 경기 진행 버튼에 클릭음을 덧입힌다.
  const withClick = (fn: () => void) => () => {
    if (soundEnabled) playClick()
    fn()
  }

  const shareResult = () => {
    const finalSlot = knockoutSlots[FINAL_SLOT_ID]?.result
    const thirdSlot = knockoutSlots[THIRD_SLOT_ID]?.result
    if (!finalSlot || !champion) return
    const runnerUp = finalSlot.winnerTeamId === finalSlot.homeTeamId ? finalSlot.awayTeamId : finalSlot.homeTeamId
    const name = (id?: string) => (id ? TEAMS_BY_ID[id]?.nameKo ?? id : '-')
    const lines = [
      '🏆 2026 북중미 월드컵 시뮬레이션 결과',
      `🥇 우승: ${name(champion)}`,
      `🥈 준우승: ${name(runnerUp)}`,
      thirdSlot ? `🥉 3위: ${name(thirdSlot.winnerTeamId)}` : '',
      seed ? `🎲 조추첨 시드: ${seed}` : '',
    ].filter(Boolean)
    void navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      setShared(true)
      setTimeout(() => setShared(false), 1800)
    })
  }

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
                <GlassButton onClick={withClick(advanceTimeSlot)} disabled={!nextSlotPreview}>
                  ⏱ 다음 시간대 진행{nextSlotPreview && ` (${nextSlotPreview.timeSlot})`}
                </GlassButton>
                <GlassButton variant="ghost" onClick={withClick(advanceDay)}>
                  ▶ 다음 날 전체 진행
                </GlassButton>
                <GlassButton variant="ghost" onClick={withClick(advanceToEnd)} disabled={!nextSlotPreview}>
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
            <div className="flex flex-col items-center gap-3">
              <p className="text-lg font-bold text-amber-300">🎉 우승팀이 결정되었습니다!</p>
              {onNextEdition && (
                <GlassButton
                  onClick={onNextEdition}
                  title="이번 성적을 반영하고 새 개최국을 선정해, 다음 월드컵 지역예선을 바로 시작합니다"
                >
                  🔜 다음 월드컵 지역예선으로 →
                </GlassButton>
              )}
            </div>
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
                <span className="text-xs font-bold tabular-nums text-amber-300">
                  {row.championPct.toFixed(1)}%
                  <span className="ml-0.5 font-normal text-[10px] text-gray-500">
                    ±{marginOfError95(row.championPct, simIterations).toFixed(1)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <DayResultFeed />
      <TournamentSummary />
      <VenueMap />
      <SaveSlotsPanel />
      {champion && (
        <GlassCard strong className="p-6 text-center">
          <p className="text-sm text-gray-300">
            {editionYear} 월드컵 우승
            <span className="ml-1 text-[11px] text-sky-300">
              (개최: {editionHosts.map((id) => TEAMS_BY_ID[id]?.nameKo ?? id).join('·')})
            </span>
          </p>
          <p className="font-display mt-1 flex items-center justify-center gap-3 text-3xl font-semibold tracking-wide text-amber-300">
            🏆 <FlagIcon iso2={TEAMS_BY_ID[champion].iso2} className="h-6 w-9" /> {TEAMS_BY_ID[champion].nameKo}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <GlassButton variant="ghost" onClick={shareResult}>
              {shared ? '✓ 결과 복사됨' : '📋 결과 공유'}
            </GlassButton>
            {onNextEdition && (
              <GlassButton
                onClick={onNextEdition}
                title="이번 성적을 반영하고 새 개최국을 선정해, 다음 월드컵 지역예선을 바로 시작합니다"
              >
                🔜 다음 월드컵 지역예선으로 →
              </GlassButton>
            )}
          </div>
          {onNextEdition && (
            <p className="mt-3 text-[11px] text-gray-400">
              다음 대회 개최국이 새로 선정되고, 이번 대회 성적이 각 팀의 전력에 반영되어 새 예선이 시작됩니다.
            </p>
          )}
        </GlassCard>
      )}
    </div>
  )
}
