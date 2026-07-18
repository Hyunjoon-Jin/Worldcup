import { useEffect, useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { FlagIcon } from '../common/FlagIcon'
import { UpsetBadge } from '../common/UpsetBadge'
import { GroupTable } from '../groups/GroupTable'
import { TournamentSummary } from '../schedule/TournamentSummary'
import { CupSaveSlotsPanel } from './CupSaveSlotsPanel'
import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../../data/nations'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { formatKoreanDate } from '../../data/calendar'
import { buildCupPhases } from '../../engine/season/seasonTimeline'
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
  match: { group: letterOf(m.group), matchday: m.matchday as 1 | 2 | 3, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals },
})
const koRef = (m: CupKnockoutMatch): MatchDetailRef => ({ kind: 'knockout', external: true, match: toKnockoutMatch(m) })

/**
 * 대륙컵 '일정 진행' 뷰 — 월드컵 ScheduleStage와 동형 구성: 진행 상태·타임라인 → 진행 버튼 → 다음 경기
 * 예정 → 결과 피드(순위 변동) → 대회 통계/명장면/업적(월드컵 TournamentSummary 재사용) → 우승 카드.
 */
export function ContinentalProgressView({ result, format }: { result: CupResult; format: CupFormat }) {
  const activeCupId = useContinentalStore((s) => s.activeCupId)!
  const stage = useContinentalStore((s) => s.stage)
  const cupYear = useContinentalStore((s) => s.cupYear)
  const hostIds = useContinentalStore((s) => s.hostIds)
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
  const revealedKoRounds = Math.max(0, stage - 3)
  const fullyRevealed = stage >= totalStages
  const mainRounds = useMemo(() => format.knockout.filter((r) => r !== 'THIRD'), [format])
  const currentRound: KnockoutRound | null = stage > 3 ? mainRounds[stage - 4] ?? null : null

  const phases = useMemo(() => buildCupPhases(activeCupId, cupYear ?? new Date().getFullYear()), [activeCupId, cupYear])
  const dateByKey = useMemo(() => Object.fromEntries(phases.map((p) => [p.key, p.start])), [phases])

  const statusText = fullyRevealed
    ? '🏆 대회 종료'
    : stage === 0
      ? '조별리그 시작 전'
      : stage <= 3
        ? `조별리그 진행 중 — ${stage}/3차전`
        : `녹아웃 진행 중 — ${currentRound ? ROUND_LABEL[currentRound] : ''}`

  // 다음 경기 예정 — 다음 단계의 경기들.
  const nextPreview = useMemo(() => {
    if (fullyRevealed) return null
    if (stage < 3) {
      const md = stage + 1
      const fixtures = result.groups.flatMap((g) => g.matches.filter((m) => m.matchday === md).map((m) => ({ homeId: m.homeTeamId, awayId: m.awayTeamId, label: `${letterOf(g.groupIndex)}조` })))
      return { date: dateByKey[`G${md}`], label: `조별리그 ${md}차전`, fixtures }
    }
    const round = mainRounds[stage - 3]
    if (!round) return null
    const fixtures = result.knockout.filter((m) => m.round === round).map((m) => ({ homeId: m.homeTeamId, awayId: m.awayTeamId, label: ROUND_LABEL[round] }))
    return { date: dateByKey[round], label: ROUND_LABEL[round], fixtures }
  }, [fullyRevealed, stage, result, mainRounds, dateByKey])

  // 결과 피드 — 방금 공개된 단계의 경기.
  const feed = useMemo(() => {
    if (stage === 0) return null
    if (stage <= 3) {
      const md = stage
      const groupMatches = result.groups.flatMap((g) => g.matches.filter((m) => m.matchday === md))
      const touched = result.groups.filter((g) => g.matches.some((m) => m.matchday === md))
      return { kind: 'group' as const, label: `조별리그 ${md}차전 결과`, groupMatches, touched, koMatches: [] as CupKnockoutMatch[] }
    }
    const round = currentRound
    const koMatches = round ? result.knockout.filter((m) => m.round === round) : []
    // 결승 단계면 3·4위전도 함께 보여준다(월드컵과 동일).
    const extra = fullyRevealed && format.thirdPlace ? result.knockout.filter((m) => m.round === 'THIRD') : []
    return { kind: 'ko' as const, label: `${round ? ROUND_LABEL[round] : ''} 결과`, groupMatches: [] as CupMatch[], touched: [], koMatches: [...koMatches, ...extra] }
  }, [stage, result, currentRound, fullyRevealed, format])

  // 대회 통계용(공개분 전체).
  const revealedGroupMatches: GroupMatch[] = useMemo(
    () => result.groups.flatMap((g) => g.matches.filter((m) => m.matchday <= revealedGroupMd).map((m) => ({ group: letterOf(g.groupIndex), matchday: m.matchday as 1 | 2 | 3, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals }))),
    [result, revealedGroupMd],
  )
  const revealedKoMatches: KnockoutMatch[] = useMemo(() => {
    const shownRounds = new Set(mainRounds.slice(0, revealedKoRounds))
    if (fullyRevealed && format.thirdPlace) shownRounds.add('THIRD')
    return result.knockout.filter((m) => shownRounds.has(m.round)).map(toKnockoutMatch)
  }, [result, mainRounds, revealedKoRounds, fullyRevealed, format])

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

  const timeline: { key: string; label: string; done: boolean; now: boolean }[] = [
    ...[1, 2, 3].map((md) => ({ key: `G${md}`, label: `${md}차전`, done: stage > md, now: stage === md })),
    ...mainRounds.map((r, i) => ({ key: r, label: ROUND_LABEL[r], done: stage > 4 + i, now: stage === 4 + i })),
  ]

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-5">
        <p className="mb-3 text-center text-sm font-semibold text-white">{statusText}</p>
        {/* 타임라인 — 조별 3차전 + 녹아웃 라운드(월드컵 CalendarTimeline과 동형) */}
        <div className="scrollbar-thin mb-1 flex gap-1.5 overflow-x-auto pb-2">
          {timeline.map((t, i) => (
            <div key={t.key} className={`flex shrink-0 flex-col items-center rounded-lg px-2 py-1.5 text-[10px] ${t.now ? 'glass-strong ring-1 ring-emerald-300/70' : t.done ? 'bg-white/10 text-gray-400' : 'bg-white/[0.03] text-gray-600'} ${i === 3 ? 'ml-2 border-l border-white/15 pl-3' : ''}`}>
              <span className="font-bold">{t.label}</span>
              {dateByKey[t.key] && <span>{formatKoreanDate(dateByKey[t.key])}</span>}
            </div>
          ))}
        </div>
        {!fullyRevealed ? (
          <div className="mt-3 flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <GlassButton onClick={advanceStage}>▶ 다음 단계 진행</GlassButton>
              <GlassButton variant="ghost" onClick={advanceToEnd}>⏭ 결승까지 자동 진행</GlassButton>
            </div>
            {nextPreview && nextPreview.fixtures.length > 0 && (
              <div className="w-full max-w-lg rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="mb-1.5 text-[11px] font-bold text-sky-300">
                  📋 다음 경기 예정 — {nextPreview.label}{nextPreview.date ? ` · ${formatKoreanDate(nextPreview.date)}` : ''} · {nextPreview.fixtures.length}경기
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
                    <span className="text-xs text-gray-500">{letterOf(m.group)}조</span>
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
                      qualifyLine={format.advancePerGroup}
                      compact
                    />
                  </div>
                ))}
              </div>
            </>
          )}
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
            🏆 <TeamLink teamId={result.champion} flagClassName="h-6 w-9" className="text-3xl font-semibold text-amber-300" />
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            준우승 <TeamLink teamId={result.runnerUp} />{result.third && <> · 3위 <TeamLink teamId={result.third} /></>}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <GlassButton variant="ghost" onClick={shareResult}>{shared ? '✓ 결과 복사됨' : '📋 결과 공유'}</GlassButton>
          </div>
        </GlassCard>
      )}
    </div>
  )
}
