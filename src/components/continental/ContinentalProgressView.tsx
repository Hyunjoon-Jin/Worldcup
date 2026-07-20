import { useEffect, useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { FlagIcon } from '../common/FlagIcon'
import { UpsetBadge } from '../common/UpsetBadge'
import { GroupTable } from '../groups/GroupTable'
import { TournamentSummary } from '../schedule/TournamentSummary'
import { CupSaveSlotsPanel } from './CupSaveSlotsPanel'
import { computeCupStatuses } from '../../engine/continental/cupGroupHelpers'
import { rankGroupTeams } from '../../engine/tiebreakers'
import type { CrisisInfo } from '../../store/useCrisisTeams'
import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../../data/nations'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { formatKoreanDate, BASE_FINALS_YEAR } from '../../data/calendar'
import { cupScheduleDays } from '../../engine/continental/cupSchedule'
import { classifyMatchUpset, isUpset } from '../../engine/matchEngine'
import { marginOfError95 } from '../../engine/confidence'
import { useContinentalStore, cupTotalStages } from '../../store/useContinentalStore'
import { useMatchDetailStore, type MatchDetailRef } from '../../store/useMatchDetailStore'
import type { CupFormat } from '../../data/continental/formats'
import type { CupKnockoutMatch, CupMatch, CupResult } from '../../engine/continental/runCup'
import type { GroupMatch, KnockoutMatch, KnockoutRound } from '../../types/match'

const ROUND_LABEL: Record<KnockoutRound, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위전', FINAL: '결승' }

const letterOf = (gi: number) => GROUP_LETTERS[gi] as GroupMatch['group']

function toKnockoutMatch(m: CupKnockoutMatch): KnockoutMatch {
  return {
    round: m.round,
    slotId: m.slotId,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeGoals: m.result.homeGoals,
    awayGoals: m.result.awayGoals,
    wentToPenalties: m.result.wentToPenalties,
    winnerTeamId: m.result.winnerTeamId,
    homePenalties: m.result.homePenalties,
    awayPenalties: m.result.awayPenalties,
  }
}

const groupRef = (m: CupMatch): MatchDetailRef => ({
  kind: 'group',
  external: true,
  competition: 'cup',
  match: { group: letterOf(m.group), matchday: m.matchday as 1 | 2 | 3, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals },
})
const koRef = (m: CupKnockoutMatch): MatchDetailRef => ({ kind: 'knockout', external: true, competition: 'cup', match: toKnockoutMatch(m) })

/**
 * 대륙컵 '일정 진행' 뷰 — 월드컵 ScheduleStage와 동형 구성: 진행 상태·타임라인 → 진행 버튼 → 다음 경기
 * 예정 → 결과 피드(순위 변동) → 대회 통계/명장면/업적(월드컵 TournamentSummary 재사용) → 우승 카드.
 */
export function ContinentalProgressView({ result, format, onNavigate }: { result: CupResult; format: CupFormat; onNavigate?: () => void }) {
  const activeCupId = useContinentalStore((s) => s.activeCupId)!
  const stage = useContinentalStore((s) => s.stage)
  const slotStep = useContinentalStore((s) => s.slotStep)
  const lastRevealFrom = useContinentalStore((s) => s.lastRevealFrom)
  const cupYear = useContinentalStore((s) => s.cupYear)
  const hostIds = useContinentalStore((s) => s.hostIds)
  const advanceTimeSlot = useContinentalStore((s) => s.advanceTimeSlot)
  const advanceStage = useContinentalStore((s) => s.advanceStage)
  const advanceToEnd = useContinentalStore((s) => s.advanceToEnd)
  const probabilities = useContinentalStore((s) => s.probabilities)
  const computeProbabilities = useContinentalStore((s) => s.computeProbabilities)
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)
  const [shared, setShared] = useState(false)

  // 실황 반영 확률을 진행 단계마다 다시 계산(월드컵처럼 실시간 우승 확률 TOP3 + 추이 스냅샷 축적).
  useEffect(() => {
    computeProbabilities()
  }, [stage, computeProbabilities])

  const top3 = useMemo(() => {
    if (!probabilities) return []
    return Object.entries(probabilities.byTeam)
      .map(([teamId, p]) => ({ teamId, championPct: p.champion }))
      .sort((a, b) => b.championPct - a.championPct)
      .slice(0, 3)
  }, [probabilities])
  const MEDALS = ['🥇', '🥈', '🥉']

  const totalStages = cupTotalStages(activeCupId)
  const revealedGroupMd = Math.min(stage, 3)
  const fullyRevealed = stage >= totalStages
  const mainRounds = useMemo(() => format.knockout.filter((r) => r !== 'THIRD'), [format])

  // 월드컵과 동일한 '일·시간대' 편성. days[stage]가 진행 중인 하루, slotStep이 그 하루의 공개된 시간대 수.
  const days = useMemo(() => cupScheduleDays(result, format, activeCupId, cupYear ?? BASE_FINALS_YEAR), [result, format, activeCupId, cupYear])
  const currentDay = stage < days.length ? days[stage] : null
  const nextSlot = currentDay && slotStep < currentDay.slots.length ? currentDay.slots[slotStep] : null

  const statusText = fullyRevealed
    ? '🏆 대회 종료'
    : currentDay?.kind === 'group'
      ? `그룹스테이지 진행 중 — Day ${currentDay.groupDay} / 3`
      : `토너먼트 진행 중 — ${currentDay?.label ?? ''}`

  // 다음 경기 예정 — 다음 시간대의 경기들(월드컵 ScheduleStage와 동형).
  const nextPreview = useMemo(() => {
    if (fullyRevealed || !currentDay || !nextSlot) return null
    const fixtures = [
      ...nextSlot.group.map((m) => ({ homeId: m.homeTeamId, awayId: m.awayTeamId, label: `조 ${letterOf(m.group)}` })),
      ...nextSlot.ko.map((m) => ({ homeId: m.homeTeamId, awayId: m.awayTeamId, label: currentDay.label })),
    ]
    return { date: currentDay.date, timeSlot: nextSlot.timeSlot, fixtures }
  }, [fullyRevealed, currentDay, nextSlot])

  // 결과 피드 — '방금 진행한 배치'만 보여준다(누적 금지, 월드컵 lastDayGroupResults와 동형).
  // lastRevealFrom(배치 시작 커서)부터 현재 커서(stage, slotStep)까지의 시간대만 모은다.
  const feed = useMemo(() => {
    if (!lastRevealFrom) return null
    const shown: typeof days[number]['slots'] = []
    let feedDate: string | null = null
    for (let d = lastRevealFrom.day; d <= stage && d < days.length; d++) {
      const day = days[d]
      const start = d === lastRevealFrom.day ? lastRevealFrom.slot : 0
      const end = d < stage ? day.slots.length : slotStep // 현재 진행 중인 하루는 공개된 시간대까지
      const part = day.slots.slice(start, end)
      if (part.length > 0) {
        shown.push(...part)
        feedDate = day.date
      }
    }
    if (shown.length === 0) return null
    const groupMatches = shown.flatMap((s) => s.group)
    const koMatches = shown.flatMap((s) => s.ko)
    const lastSlot = shown[shown.length - 1]
    const touched = result.groups.filter((g) => groupMatches.some((m) => m.group === g.groupIndex))
    return { label: `${feedDate ? formatKoreanDate(feedDate) : ''}${lastSlot ? ` ${lastSlot.timeSlot}` : ''} 결과`, groupMatches, koMatches, touched }
  }, [lastRevealFrom, slotStep, stage, days, result])

  // 대회 통계·순위 변동용 공개 경기(완료된 하루 전부 + 진행 중 하루의 공개 시간대까지).
  const revealedGroupMatches: GroupMatch[] = useMemo(() => {
    const out: GroupMatch[] = []
    days.forEach((d, i) => {
      const limit = i < stage ? d.slots.length : i === stage ? slotStep : 0
      d.slots.slice(0, limit).forEach((s) => s.group.forEach((m) => out.push({ group: letterOf(m.group), matchday: m.matchday as 1 | 2 | 3, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals })))
    })
    return out
  }, [days, stage, slotStep])
  const revealedKoMatches: KnockoutMatch[] = useMemo(() => {
    const out: KnockoutMatch[] = []
    days.forEach((d, i) => {
      const limit = i < stage ? d.slots.length : i === stage ? slotStep : 0
      d.slots.slice(0, limit).forEach((s) => s.ko.forEach((m) => out.push(toKnockoutMatch(m))))
    })
    return out
  }, [days, stage, slotStep])

  // 순위 변동 표의 진출확정/탈락확정·위기 배지·순위 변동 화살표(월드컵 DayResultFeed와 동형).
  const statusByTeam = useMemo(() => computeCupStatuses(result, format, revealedGroupMd), [result, format, revealedGroupMd])
  const crisisByTeam = useMemo<Record<string, CrisisInfo>>(() => {
    const out: Record<string, CrisisInfo> = {}
    if (!probabilities) return out
    const firstRound = mainRounds[0]
    if (!firstRound) return out
    for (const [id, p] of Object.entries(probabilities.byTeam)) {
      const gp = p.reach[firstRound] ?? 0
      if (gp > 0 && gp < 50) out[id] = { pct: gp }
    }
    return out
  }, [probabilities, mainRounds])
  const deltaByGroup = useMemo<Record<string, Record<string, number>>>(() => {
    const out: Record<string, Record<string, number>> = {}
    if (!feed) return out
    const keyOf = (m: { homeTeamId: string; awayTeamId: string; matchday: number }) => `${m.homeTeamId}-${m.awayTeamId}-${m.matchday}`
    const frontierKeys = new Set(feed.groupMatches.map(keyOf))
    for (const g of feed.touched) {
      const letter = letterOf(g.groupIndex)
      const all = revealedGroupMatches.filter((m) => m.group === letter)
      const before = all.filter((m) => !frontierKeys.has(keyOf(m)))
      const curr = rankGroupTeams(g.teams, all, format.groupTiebreak)
      const prev = rankGroupTeams(g.teams, before, format.groupTiebreak)
      const d: Record<string, number> = {}
      for (const id of g.teams) d[id] = prev.indexOf(id) - curr.indexOf(id)
      out[letter] = d
    }
    return out
  }, [feed, revealedGroupMatches, format])

  const shareResult = () => {
    const name = (id?: string | null) => (id ? TEAMS_BY_ID[id]?.nameKo ?? id : '-')
    const lines = [
      `🏆 ${format.nameKo}${cupYear ? ` ${cupYear}` : ''} — 대회 결과`,
      `🥇 우승: ${name(result.champion)}`,
      `🥈 준우승: ${name(result.runnerUp)}`,
      result.third ? `🥉 3위: ${name(result.third)}` : '',
    ].filter(Boolean)
    void navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      setShared(true)
      setTimeout(() => setShared(false), 1800)
    })
  }

  // 타임라인 — 월드컵 CalendarTimeline과 동형: 조별은 D1·D2·D3(일), 녹아웃은 라운드 칩.
  const timeline = days.map((d) => ({
    key: d.kind === 'group' ? `G${d.groupDay}` : d.round!,
    label: d.kind === 'group' ? `D${d.groupDay}` : d.label,
    date: d.date,
    done: stage > d.stageIndex,
    now: stage === d.stageIndex,
    ko: d.kind === 'knockout',
  }))

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-3 text-sm font-semibold text-white">{statusText}</p>
        {/* 타임라인 — 조별 3차전 + 녹아웃 라운드(월드컵 CalendarTimeline과 동형: 녹아웃 현재는 앰버) */}
        <div className="scrollbar-thin mb-1 flex gap-1.5 overflow-x-auto pb-2">
          {timeline.map((t, i) => (
            <div key={t.key} className={`flex shrink-0 flex-col items-center rounded-lg px-2 py-1.5 text-[10px] ${t.now ? `glass-strong ring-1 ${t.ko ? 'ring-amber-300/70' : 'ring-emerald-300/70'}` : t.done ? 'bg-white/10 text-gray-400' : 'bg-white/[0.03] text-gray-600'} ${i === 3 ? 'ml-2 border-l border-white/15 pl-3' : ''}`}>
              <span className="font-bold">{t.label}</span>
              {t.date && <span>{formatKoreanDate(t.date)}</span>}
            </div>
          ))}
        </div>
        {!fullyRevealed ? (
          <div className="mt-3 flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <GlassButton onClick={advanceTimeSlot} disabled={!nextSlot}>⏱ 다음 시간대 진행{nextSlot ? ` (${nextSlot.timeSlot})` : ''}</GlassButton>
              <GlassButton variant="ghost" onClick={advanceStage}>▶ 다음 날 전체 진행</GlassButton>
              <GlassButton variant="ghost" onClick={advanceToEnd}>⏭ 결승까지 자동 진행</GlassButton>
            </div>
            {nextPreview && nextPreview.fixtures.length > 0 && (
              <div className="w-full max-w-lg rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="mb-1.5 text-[11px] font-bold text-sky-300">
                  📋 다음 경기 예정 — {nextPreview.date ? `${formatKoreanDate(nextPreview.date)} ` : ''}{nextPreview.timeSlot} 현지시간 · {nextPreview.fixtures.length}경기
                </p>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {nextPreview.fixtures.map((fx, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded bg-white/5 px-2 py-1 text-[11px]">
                      <span className="w-10 shrink-0 text-[9px] text-gray-500">{fx.label}</span>
                      <span className="flex flex-1 items-center justify-center gap-1.5">
                        <FlagIcon iso2={TEAMS_BY_ID[fx.homeId]?.iso2 ?? ''} className="h-2.5 w-4" />
                        <span className="truncate text-gray-300">{TEAMS_BY_ID[fx.homeId]?.nameKo ?? fx.homeId}</span>
                        <span className="shrink-0 text-gray-600">vs</span>
                        <span className="truncate text-gray-300">{TEAMS_BY_ID[fx.awayId]?.nameKo ?? fx.awayId}</span>
                        <FlagIcon iso2={TEAMS_BY_ID[fx.awayId]?.iso2 ?? ''} className="h-2.5 w-4" />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-center text-lg font-bold text-amber-300">🎉 우승팀이 결정되었습니다!</p>
        )}
      </GlassCard>

      {/* 실시간 우승 확률 TOP 3(월드컵 ScheduleStage와 동형) */}
      {!fullyRevealed && top3.length > 0 && (
        <GlassCard className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <h3 className="shrink-0 text-xs font-bold whitespace-nowrap text-amber-300">🏆 실시간 우승 확률 TOP 3</h3>
          <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
            {top3.map((row, idx) => (
              <div key={row.teamId} className="flex items-center gap-1.5">
                <span className="text-sm">{MEDALS[idx]}</span>
                <TeamLink teamId={row.teamId} className="text-xs font-medium text-gray-100" />
                <span className="text-xs font-bold tabular-nums text-amber-300">
                  {row.championPct.toFixed(1)}%
                  <span className="ml-0.5 text-[10px] font-normal text-gray-500">±{marginOfError95(row.championPct, probabilities?.iterations ?? 1).toFixed(1)}</span>
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* 결과 피드 — 방금 공개된 단계의 경기 + 순위 변동(월드컵 DayResultFeed와 동형) */}
      {feed && (feed.groupMatches.length > 0 || feed.koMatches.length > 0) && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-bold text-emerald-300">{fullyRevealed ? `🏆 대회 종료 — ${feed.label}` : feed.label}</h3>
          <div className={feed.touched.length > 0 ? 'mb-4 space-y-1.5' : 'space-y-1.5'}>
            {feed.groupMatches.map((m, i) => {
              const { upset, surpriseDraw } = classifyMatchUpset(m.homeTeamId, m.awayTeamId, m.homeGoals, m.awayGoals)
              return (
                <div key={`g-${i}`} onClick={() => selectMatch(groupRef(m))} className={`flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between ${upset ? 'bg-red-500/10 ring-1 ring-red-400/30' : 'bg-white/5'}`}>
                  <div className="flex items-center justify-between sm:w-10 sm:shrink-0">
                    <span className="text-xs text-gray-500">조{letterOf(m.group)}</span>
                    <span className="sm:hidden"><UpsetBadge upset={upset} surpriseDraw={surpriseDraw} /></span>
                  </div>
                  <span className="flex flex-1 items-center justify-center gap-2">
                    <TeamLink teamId={m.homeTeamId} wrap className="min-w-0" />
                    <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 font-bold text-white">{m.homeGoals} - {m.awayGoals}</span>
                    <TeamLink teamId={m.awayTeamId} reverse wrap className="min-w-0" />
                  </span>
                  <span className="hidden w-16 shrink-0 text-right sm:block"><UpsetBadge upset={upset} surpriseDraw={surpriseDraw} /></span>
                </div>
              )
            })}
            {feed.koMatches.map((m, i) => {
              const km = toKnockoutMatch(m)
              const loserId = km.winnerTeamId === km.homeTeamId ? km.awayTeamId : km.homeTeamId
              const upsetResult = isUpset(km.winnerTeamId, loserId)
              return (
                <div key={`k-${i}`} onClick={() => selectMatch(koRef(m))} className={`flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between ${upsetResult ? 'bg-red-500/10 ring-1 ring-red-400/30' : 'bg-white/5'}`}>
                  <div className="flex items-center justify-between sm:w-14 sm:shrink-0">
                    <span className="text-xs text-gray-500">{ROUND_LABEL[km.round]}</span>
                    <span className="flex items-center gap-1.5 sm:hidden"><UpsetBadge upset={upsetResult} /><span className="text-xs font-bold text-emerald-300">{TEAMS_BY_ID[km.winnerTeamId]?.nameKo} 승</span></span>
                  </div>
                  <span className="flex flex-1 items-center justify-center gap-2">
                    <TeamLink teamId={km.homeTeamId} wrap className="min-w-0" />
                    <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 font-bold text-white">{km.homeGoals} - {km.awayGoals}</span>
                    <TeamLink teamId={km.awayTeamId} reverse wrap className="min-w-0" />
                    {km.wentToPenalties && <span className="text-[10px] text-gray-500">(승부차기{km.homePenalties != null && km.awayPenalties != null ? ` ${km.homePenalties}-${km.awayPenalties}` : ''})</span>}
                  </span>
                  <span className="hidden w-24 shrink-0 items-center justify-end gap-1.5 sm:flex"><UpsetBadge upset={upsetResult} /><span className="text-xs font-bold text-emerald-300">{TEAMS_BY_ID[km.winnerTeamId]?.nameKo} 승</span></span>
                </div>
              )
            })}
          </div>
          {feed.touched.length > 0 && (
            <>
              <h4 className="mb-2 text-xs font-bold text-gray-400">순위 변동 (해당 조)</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {feed.touched.map((g) => (
                  <div key={g.groupIndex} className="rounded-lg bg-white/[0.03] p-2">
                    <div className="font-display mb-1 text-sm font-semibold tracking-wide text-sky-300">GROUP {letterOf(g.groupIndex)}</div>
                    <GroupTable
                      teamIds={g.teams}
                      matches={revealedGroupMatches.filter((m) => m.group === letterOf(g.groupIndex))}
                      delta={deltaByGroup[letterOf(g.groupIndex)]}
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
      )}

      {/* 결과 피드 빈 상태(월드컵 DayResultFeed와 동형) — 아직 아무 경기도 공개되지 않았을 때 */}
      {revealedGroupMatches.length === 0 && revealedKoMatches.length === 0 && (
        <GlassCard className="p-4 text-center text-sm text-gray-400">
          아직 진행된 경기가 없습니다. <strong className="text-gray-300">다음 단계 진행</strong>을 눌러 시작하세요.
        </GlassCard>
      )}

      {/* 대회 통계·명장면·업적 — 월드컵과 동일 컴포넌트 재사용 */}
      <TournamentSummary groupMatches={revealedGroupMatches} knockoutMatches={revealedKoMatches} champion={fullyRevealed ? result.champion : null} />

      {/* 대회 저장 슬롯 — 월드컵과 동형(대륙컵 전용 저장소) */}
      <CupSaveSlotsPanel champion={fullyRevealed ? result.champion : null} canSave={stage > 0} />

      {/* 우승 카드 — 월드컵과 동형(연도·개최국·플래그·공유) */}
      {fullyRevealed && (
        <GlassCard strong className="p-6 text-center">
          <p className="text-sm text-gray-300">
            {cupYear ? `${cupYear} ` : ''}{format.nameKo} 우승
            {hostIds.length > 0 && (
              <span className="ml-1 text-[11px] text-sky-300">(개최: {hostIds.map((id) => TEAMS_BY_ID[id]?.nameKo ?? id).join('·')})</span>
            )}
          </p>
          <p className="font-display mt-1 flex items-center justify-center gap-3 text-3xl font-semibold tracking-wide text-amber-300">
            🏆 {TEAMS_BY_ID[result.champion] && <FlagIcon iso2={TEAMS_BY_ID[result.champion].iso2} className="h-6 w-9" />} {TEAMS_BY_ID[result.champion]?.nameKo ?? result.champion}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <GlassButton variant="ghost" onClick={shareResult}>{shared ? '✓ 결과 복사됨' : '📋 결과 공유'}</GlassButton>
            {onNavigate && (
              <GlassButton onClick={onNavigate} title="캘린더로 돌아가 다음 시즌을 이어갑니다">📅 캘린더로 →</GlassButton>
            )}
          </div>
          {onNavigate && (
            <p className="mt-3 text-[11px] text-gray-400">
              다음 대회 개최국이 새로 선정되고, 이번 대회 성적이 각 팀의 전력에 반영됩니다. 캘린더에서 새 시즌을 이어가세요.
            </p>
          )}
        </GlassCard>
      )}
    </div>
  )
}
