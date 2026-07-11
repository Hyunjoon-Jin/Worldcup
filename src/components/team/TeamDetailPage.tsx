import { useEffect, useMemo, useState } from 'react'
import { CONFEDERATION_LABEL_KO, TEAMS_BY_ID } from '../../data/teams'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { formatKoreanDate } from '../../data/calendar'
import { FlagIcon } from '../common/FlagIcon'
import { GlassButton } from '../common/GlassButton'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { UpsetBadge } from '../common/UpsetBadge'
import { ProbBar } from '../probability/ProbBar'
import { STAGES } from '../probability/probabilityStages'
import { getRatings, classifyMatchUpset, isUpset } from '../../engine/matchEngine'
import {
  analyzeLastMatchdayScenarios,
  analyzeThirdPlaceRoute,
  computeQualificationStatuses,
  type GroupThreatVerdict,
  type OurResultScenario,
  type ScenarioVerdict,
} from '../../engine/qualificationStatus'
import { runOpponentForecast, runTeamScenarioSimulation, type RoundOpponentForecast, type TeamScenarioResult } from '../../engine/monteCarlo'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useSelectionStore } from '../../store/useSelectionStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import { useCrisisTeams } from '../../store/useCrisisTeams'
import { useMatchDetailStore, type MatchDetailRef } from '../../store/useMatchDetailStore'
import type { GroupLetter } from '../../types/group'

const ROUND_LABEL_KO: Record<string, string> = {
  R32: '32강',
  R16: '16강',
  QF: '8강',
  SF: '4강',
  THIRD: '3·4위전',
  FINAL: '결승',
}

const VERDICT_CONFIG: Record<ScenarioVerdict, { label: string; icon: string; className: string }> = {
  advance: { label: '32강 진출 확정', icon: '✅', className: 'text-emerald-300' },
  eliminated: { label: '32강 진출 실패', icon: '❌', className: 'text-red-300' },
  tiebreak: { label: '타이브레이커로 결정', icon: '⚠️', className: 'text-amber-300' },
  thirdPending: { label: '3위 진출 여부 미정', icon: '🔎', className: 'text-sky-300' },
}

const GROUP_THREAT_CONFIG: Record<GroupThreatVerdict, { label: string; icon: string; className: string }> = {
  ahead: { label: '위협', icon: '🔺', className: 'bg-red-500/15 text-red-300' },
  pending: { label: '미정', icon: '⏳', className: 'bg-amber-500/15 text-amber-300' },
  behind: { label: '안전', icon: '✅', className: 'bg-emerald-500/15 text-emerald-300' },
}

function GroupThreatBadge({ verdict }: { verdict: GroupThreatVerdict }) {
  const config = GROUP_THREAT_CONFIG[verdict]
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${config.className}`}>
      {config.icon} {config.label}
    </span>
  )
}

function VerdictLine({ verdict, text, note }: { verdict: ScenarioVerdict; text?: string; note?: string }) {
  const config = VERDICT_CONFIG[verdict]
  return (
    <span className="flex flex-col gap-0.5">
      <span className={`text-xs font-bold ${config.className}`}>
        {text && <span className="mr-1 font-normal text-gray-400">{text}</span>}
        {config.icon} {config.label}
      </span>
      {note && <span className="text-[10px] text-gray-500">{note}</span>}
    </span>
  )
}

interface MatchHistoryEntry {
  key: string
  label: string
  date?: string
  opponentId: string
  goalsFor: number
  goalsAgainst: number
  result: 'W' | 'D' | 'L'
  upset: boolean
  detailRef: MatchDetailRef
}

interface UpcomingMatchEntry {
  key: string
  label: string
  date?: string
  timeSlot?: string
  opponentId: string | null
}

export function TeamDetailPage() {
  const teamId = useSelectionStore((s) => s.selectedTeamId)
  const clearTeam = useSelectionStore((s) => s.clearTeam)
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)
  const drawGroups = useDrawStore((s) => s.state.groups)
  const { schedule, groupMatches, knockoutSlots } = useProgressStore()
  const simResult = useSimulationStore((s) => s.result)
  const crisisByTeam = useCrisisTeams()

  const [scenario, setScenario] = useState<TeamScenarioResult | null>(null)
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [forecast, setForecast] = useState<RoundOpponentForecast[] | null>(null)
  const [forecastLoading, setForecastLoading] = useState(false)

  const team = teamId ? TEAMS_BY_ID[teamId] : null

  const group = useMemo<GroupLetter | null>(() => {
    if (!teamId) return null
    for (const g of GROUP_LETTERS) {
      if ((drawGroups[g] as (string | null)[]).includes(teamId)) return g
    }
    return null
  }, [teamId, drawGroups])

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

  const teamGroupMatches = useMemo(
    () => (group ? groupMatches.filter((m) => m.group === group && (m.homeTeamId === teamId || m.awayTeamId === teamId)) : []),
    [group, groupMatches, teamId],
  )

  const matchHistory: MatchHistoryEntry[] = useMemo(() => {
    if (!teamId) return []
    const entries: MatchHistoryEntry[] = []

    for (const m of teamGroupMatches) {
      const isHome = m.homeTeamId === teamId
      const goalsFor = isHome ? m.homeGoals : m.awayGoals
      const goalsAgainst = isHome ? m.awayGoals : m.homeGoals
      const opponentId = isHome ? m.awayTeamId : m.homeTeamId
      const { upset } = classifyMatchUpset(m.homeTeamId, m.awayTeamId, m.homeGoals, m.awayGoals)
      const fx = schedule?.groupMatches.find(
        (f) => f.group === m.group && f.matchday === m.matchday && drawGroups[m.group][f.homeSeed - 1] === m.homeTeamId,
      )
      entries.push({
        key: `group-${m.group}-${m.matchday}`,
        label: `조별리그 MD${m.matchday}`,
        date: fx?.date,
        opponentId,
        goalsFor,
        goalsAgainst,
        result: goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D',
        upset,
        detailRef: { kind: 'group', match: m, date: fx?.date, timeSlot: fx?.timeSlot },
      })
    }

    for (const slot of Object.values(knockoutSlots)) {
      if (!slot.result) continue
      const isHome = slot.result.homeTeamId === teamId
      const isAway = slot.result.awayTeamId === teamId
      if (!isHome && !isAway) continue
      const goalsFor = isHome ? slot.result.homeGoals : slot.result.awayGoals
      const goalsAgainst = isHome ? slot.result.awayGoals : slot.result.homeGoals
      const opponentId = isHome ? slot.result.awayTeamId : slot.result.homeTeamId
      const won = slot.result.winnerTeamId === teamId
      const loserTeamId = won ? opponentId : teamId
      const koFixture = schedule?.knockoutMatches.find((f) => f.slotId === slot.slotId)
      entries.push({
        key: `ko-${slot.slotId}`,
        label: ROUND_LABEL_KO[slot.round],
        opponentId,
        goalsFor,
        goalsAgainst,
        result: won ? 'W' : 'L',
        upset: isUpset(slot.result.winnerTeamId, loserTeamId),
        detailRef: { kind: 'knockout', match: slot.result, date: koFixture?.date, timeSlot: koFixture?.timeSlot },
      })
    }
    return entries
  }, [teamId, teamGroupMatches, knockoutSlots, schedule, drawGroups])

  const upcomingMatches: UpcomingMatchEntry[] = useMemo(() => {
    if (!teamId) return []
    const entries: UpcomingMatchEntry[] = []

    if (group) {
      const playedMatchdays = new Set(teamGroupMatches.map((m) => m.matchday))
      for (const fx of schedule?.groupMatches ?? []) {
        if (fx.group !== group || playedMatchdays.has(fx.matchday)) continue
        const homeId = drawGroups[group][fx.homeSeed - 1]
        const awayId = drawGroups[group][fx.awaySeed - 1]
        if (homeId !== teamId && awayId !== teamId) continue
        entries.push({
          key: `group-${fx.id}`,
          label: `조별리그 MD${fx.matchday}`,
          date: fx.date,
          timeSlot: fx.timeSlot,
          opponentId: (homeId === teamId ? awayId : homeId) ?? null,
        })
      }
    }

    for (const slot of Object.values(knockoutSlots)) {
      if (slot.result) continue
      const isHome = slot.team1Id === teamId
      const isAway = slot.team2Id === teamId
      if (!isHome && !isAway) continue
      const sched = schedule?.knockoutMatches.find((k) => k.slotId === slot.slotId)
      entries.push({
        key: `ko-${slot.slotId}`,
        label: ROUND_LABEL_KO[slot.round],
        date: sched?.date,
        timeSlot: sched?.timeSlot,
        opponentId: isHome ? slot.team2Id : slot.team1Id,
      })
    }

    return entries
  }, [teamId, group, teamGroupMatches, schedule, drawGroups, knockoutSlots])

  const teamProbabilities = simResult && teamId ? simResult.probabilities[teamId] : null

  const playedGroupCount = teamGroupMatches.length
  const showScenario = playedGroupCount === 2

  const lastMatchdayScenarios: OurResultScenario[] = useMemo(() => {
    if (!teamId || !group || !showScenario) return []
    const playedMatchdays = new Set(teamGroupMatches.map((m) => m.matchday))
    const remainingFixtures = (schedule?.groupMatches ?? []).filter(
      (fx) => fx.group === group && !playedMatchdays.has(fx.matchday),
    )
    if (remainingFixtures.length !== 2) return []
    const otherFixture = remainingFixtures.find((fx) => {
      const homeId = drawGroups[group][fx.homeSeed - 1]
      const awayId = drawGroups[group][fx.awaySeed - 1]
      return homeId !== teamId && awayId !== teamId
    })
    if (!otherFixture) return []
    const otherTeamAId = drawGroups[group][otherFixture.homeSeed - 1]
    const otherTeamBId = drawGroups[group][otherFixture.awaySeed - 1]
    if (!otherTeamAId || !otherTeamBId) return []
    return analyzeLastMatchdayScenarios(group, groupTeams, groupMatches, teamId, otherTeamAId, otherTeamBId)
  }, [teamId, group, showScenario, teamGroupMatches, groupMatches, schedule, drawGroups, groupTeams])

  useEffect(() => {
    setScenario(null)
    setForecast(null)
    if (!teamId) return

    if (playedGroupCount === 2) {
      setScenarioLoading(true)
      setTimeout(() => {
        setScenario(runTeamScenarioSimulation(teamId))
        setScenarioLoading(false)
      }, 10)
    }

    setForecastLoading(true)
    setTimeout(() => {
      setForecast(runOpponentForecast(teamId))
      setForecastLoading(false)
    }, 10)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, playedGroupCount])

  if (!team || !teamId) return null

  const ratings = getRatings(teamId)
  const status = statusByTeam[teamId]
  const thirdPlaceRoute = status === 'undecided' ? analyzeThirdPlaceRoute(teamId, groupTeams, groupMatches) : null

  return (
    <div className="flex flex-col gap-4">
      <GlassButton variant="ghost" onClick={clearTeam}>
        ← 뒤로
      </GlassButton>

      <GlassCard strong className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <FlagIcon iso2={team.iso2} className="h-10 w-14 shrink-0" />
          <div className="flex-1">
            <h2 className="font-display text-2xl font-semibold tracking-wide text-white">{team.nameKo}</h2>
            <p className="text-xs text-gray-400">
              {team.nameEn} · FIFA 랭킹 {team.fifaRankApprox}위 · {CONFEDERATION_LABEL_KO[team.confederation]} · 포트{' '}
              {team.pot}
              {group && ` · 조 ${group}`}
              {team.isHost && ' · 개최국'}
            </p>
          </div>
          {status === 'advancing' && (
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300">
              ✅ 32강 진출확정
            </span>
          )}
          {status === 'eliminated' && (
            <span className="rounded-full bg-gray-500/20 px-3 py-1 text-xs font-bold text-gray-400">❌ 탈락확정</span>
          )}
          {status === 'undecided' && crisisByTeam[teamId] && (
            <span
              className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300"
              title={`직전 대비 32강 진출 확률 ${crisisByTeam[teamId].drop.toFixed(1)}%p 하락`}
            >
              🚨 위기
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: '공격', value: ratings.attack },
            { label: '수비', value: ratings.defense },
            { label: '컨디션', value: ratings.form },
            { label: '종합', value: ratings.overall },
          ].map((r) => (
            <div key={r.label} className="rounded-lg bg-white/5 p-2 text-center">
              <div className="text-[11px] text-gray-400">{r.label}</div>
              <div className="text-lg font-bold text-white">{r.value}</div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-bold text-sky-300">경기 기록</h3>
        {matchHistory.length === 0 ? (
          <p className="text-sm text-gray-400">아직 치른 경기가 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {matchHistory.map((entry) => (
              <div
                key={entry.key}
                onClick={() => selectMatch(entry.detailRef)}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between ${
                  entry.upset ? 'bg-red-500/10 ring-1 ring-red-400/30' : 'bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between sm:w-24 sm:shrink-0">
                  <span className="text-xs text-gray-400">
                    {entry.label}
                    {entry.date && <> · {formatKoreanDate(entry.date)}</>}
                  </span>
                  <span className="flex items-center gap-1.5 sm:hidden">
                    <UpsetBadge upset={entry.upset} />
                    <span
                      className={`text-xs font-bold ${
                        entry.result === 'W' ? 'text-emerald-400' : entry.result === 'D' ? 'text-gray-400' : 'text-red-400'
                      }`}
                    >
                      {entry.result === 'W' ? '승' : entry.result === 'D' ? '무' : '패'}
                    </span>
                  </span>
                </div>
                <span className="flex flex-1 items-center justify-center gap-2">
                  <TeamLink teamId={entry.opponentId} wrap className="min-w-0" />
                  <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 font-bold text-white">
                    {entry.goalsFor} - {entry.goalsAgainst}
                  </span>
                </span>
                <span className="hidden w-20 shrink-0 items-center justify-end gap-1.5 sm:flex">
                  <UpsetBadge upset={entry.upset} />
                  <span
                    className={`text-xs font-bold ${
                      entry.result === 'W' ? 'text-emerald-400' : entry.result === 'D' ? 'text-gray-400' : 'text-red-400'
                    }`}
                  >
                    {entry.result === 'W' ? '승' : entry.result === 'D' ? '무' : '패'}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-bold text-sky-300">다음 경기 일정</h3>
        {upcomingMatches.length === 0 ? (
          <p className="text-sm text-gray-400">
            {status === 'eliminated' ? '탈락이 확정되어 예정된 경기가 없습니다.' : '예정된 경기가 없습니다.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {upcomingMatches.map((entry) => (
              <div
                key={entry.key}
                onClick={() =>
                  entry.opponentId &&
                  selectMatch({
                    kind: 'upcoming',
                    homeTeamId: teamId,
                    awayTeamId: entry.opponentId,
                    label: entry.label,
                    date: entry.date,
                    timeSlot: entry.timeSlot,
                  })
                }
                className={`flex flex-col gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-sm transition-colors sm:flex-row sm:items-center sm:justify-between ${
                  entry.opponentId ? 'cursor-pointer hover:bg-white/10' : ''
                }`}
              >
                <span className="text-xs text-gray-400 sm:w-32 sm:shrink-0">
                  {entry.label}
                  {entry.date && <> · {formatKoreanDate(entry.date)}</>}
                  {entry.timeSlot && ` ${entry.timeSlot}`}
                </span>
                <span className="flex flex-1 items-center justify-center gap-2">
                  <TeamLink teamId={teamId} wrap className="min-w-0" />
                  <span className="shrink-0 text-gray-500">vs</span>
                  {entry.opponentId ? (
                    <TeamLink teamId={entry.opponentId} reverse wrap className="min-w-0" />
                  ) : (
                    <span className="text-gray-500">TBD</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {thirdPlaceRoute && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-bold text-amber-300">3위 진출 경우의 수 (조별리그 종료)</h3>
          <p className="mb-3 text-sm text-gray-300">
            조 {thirdPlaceRoute.group} 3위로 조별리그를 마쳤습니다 (승점 {thirdPlaceRoute.ourPoints}점, 골득실{' '}
            {thirdPlaceRoute.ourGoalDiff > 0 ? `+${thirdPlaceRoute.ourGoalDiff}` : thirdPlaceRoute.ourGoalDiff}). 3위
            진출은 12개 조 3위팀 중 상위 8팀에게만 주어집니다.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-red-500/10 p-2">
              <div className="text-lg font-bold text-red-300">{thirdPlaceRoute.aheadFinished}</div>
              <div className="text-[11px] text-gray-400">이미 확정된 위협 조</div>
            </div>
            <div className="rounded-lg bg-amber-500/10 p-2">
              <div className="text-lg font-bold text-amber-300">{thirdPlaceRoute.pendingGroups}</div>
              <div className="text-[11px] text-gray-400">아직 진행 중인 조</div>
            </div>
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <div className="text-lg font-bold text-emerald-300">{thirdPlaceRoute.behindFinished}</div>
              <div className="text-[11px] text-gray-400">이미 확정된 안전 조</div>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-300">
            진행 중인 <strong className="text-white">{thirdPlaceRoute.pendingGroups}개 조</strong> 중{' '}
            <strong className="text-emerald-300">{thirdPlaceRoute.maxPendingAllowed}개 조 이하</strong>에서만 우리보다
            나은 3위팀이 나와야 32강 진출이 확정됩니다. {thirdPlaceRoute.maxPendingAllowed + 1}개 조 이상에서 우리보다
            나은 3위팀이 나오면 탈락합니다.
          </p>
          <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3">
            <p className="mb-1 text-xs font-bold text-gray-400">조별 상세 비교 (다른 11개 조)</p>
            {thirdPlaceRoute.groupDetails.map((d) => (
              <div key={d.group} className="rounded-lg bg-white/5 px-3 py-2 text-xs">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-8 shrink-0 font-bold text-gray-300">조{d.group}</span>
                    <TeamLink teamId={d.candidateTeamId} wrap className="min-w-0" flagClassName="h-2.5 w-3.5" />
                    <span className="shrink-0 text-gray-400">
                      {d.points}점 ({d.goalDiff > 0 ? `+${d.goalDiff}` : d.goalDiff})
                    </span>
                  </div>
                  <GroupThreatBadge verdict={d.verdict} />
                </div>
                {d.note && <p className="mt-1 text-[10px] text-gray-500">{d.note}</p>}
                {d.verdict === 'pending' && d.contenders && d.contenders.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                    <p className="text-[10px] font-bold text-gray-400">
                      아래 {d.contenders.length}팀 중{' '}
                      <strong className="text-amber-300">
                        {d.contendersNeeded === d.contenders.length ? '전부' : `${d.contendersNeeded}팀 이상`}
                      </strong>
                      이 조건을 충족하면 이 조가 위협이 됩니다
                    </p>
                    {d.contenders.map((c) => (
                      <div key={c.teamId} className="flex flex-col gap-0.5 rounded bg-white/5 px-2 py-1">
                        <div className="flex items-center gap-1.5">
                          <TeamLink teamId={c.teamId} wrap className="min-w-0" flagClassName="h-2.5 w-3.5" />
                          <span className="shrink-0 text-[10px] text-gray-500">
                            현재 {c.currentPoints}점 · 잔여 {c.remainingGames}경기
                          </span>
                        </div>
                        <p className={`text-[10px] ${c.alreadyAhead ? 'text-red-300' : 'text-gray-400'}`}>
                          {c.resultHint}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-bold text-emerald-300">라운드별 진출 확률</h3>
        {teamProbabilities ? (
          <div className="space-y-2">
            {STAGES.map((s) => (
              <ProbBar key={s.key} pct={teamProbabilities[s.key]} color={s.color} label={s.label} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            "확률 대시보드" 탭에서 먼저 시뮬레이션을 실행하면 이 팀의 라운드별 진출 확률이 표시됩니다.
          </p>
        )}
      </GlassCard>

      {showScenario && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-bold text-amber-300">
            마지막 조별리그 경기 결과별 32강 진출 확률 (2경기 종료 시점)
          </h3>
          {scenarioLoading || !scenario ? (
            <p className="text-sm text-gray-400">분석 중…</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { key: 'win', label: '승리 시', value: scenario.win },
                { key: 'draw', label: '무승부 시', value: scenario.draw },
                { key: 'loss', label: '패배 시', value: scenario.loss },
              ].map((s) => (
                <div key={s.key} className="rounded-lg bg-white/5 p-3 text-center">
                  <div className="text-xs text-gray-400">{s.label}</div>
                  <div className="mt-1 text-xl font-bold text-white">{s.value.toFixed(1)}%</div>
                  <div className="text-[10px] text-gray-500">32강 진출 확률</div>
                </div>
              ))}
            </div>
          )}

          {lastMatchdayScenarios.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              <p className="text-xs text-gray-400">
                동시에 열리는 같은 조 나머지 경기 결과에 따라 1·2위 직행 진출 여부가 정확히 어떻게
                갈리는지 조건별로 정리했습니다 (골득실 등 세부 타이브레이커가 필요한 경우는 별도 표시).
              </p>
              {lastMatchdayScenarios.map((rs) => (
                <div key={rs.result} className="rounded-lg bg-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-100">
                      {rs.resultLabel} 시 <span className="font-normal text-gray-400">(승점 {rs.ourFinalPoints}점)</span>
                    </span>
                  </div>
                  {rs.uniform ? (
                    <VerdictLine verdict={rs.uniform} text="동시경기 결과와 무관하게" note={rs.uniformNote} />
                  ) : (
                    <ul className="space-y-1.5">
                      {rs.outcomes.map((o) => (
                        <li key={o.key} className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-center sm:gap-2">
                          <span className="shrink-0 text-gray-400">{o.label}:</span>
                          <VerdictLine verdict={o.verdict} note={o.note} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-bold text-violet-300">라운드별 예상 상대</h3>
        {forecastLoading || !forecast ? (
          <p className="text-sm text-gray-400">분석 중…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {forecast
              .filter((f) => f.reachPct > 0.5)
              .map((f) => (
                <div key={f.round} className="rounded-lg bg-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-display text-sm font-semibold text-gray-100">{ROUND_LABEL_KO[f.round]}</span>
                    <span className="text-[10px] text-gray-500">도달 확률 {f.reachPct.toFixed(1)}%</span>
                  </div>
                  {f.opponents.length === 0 ? (
                    <p className="text-xs text-gray-500">표본 부족</p>
                  ) : (
                    <ul className="space-y-1">
                      {f.opponents.map((o) => (
                        <li key={o.teamId} className="flex items-center justify-between text-xs">
                          <TeamLink teamId={o.teamId} flagClassName="h-2.5 w-3.5" />
                          <span className="tabular-nums text-gray-300">{o.pct.toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            {forecast.every((f) => f.reachPct <= 0.5) && (
              <p className="text-sm text-gray-400">32강 진출 가능성이 낮아 예상 상대를 추정하기 어렵습니다.</p>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
