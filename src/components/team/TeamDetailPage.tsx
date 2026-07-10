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
import { computeQualificationStatuses } from '../../engine/qualificationStatus'
import { runOpponentForecast, runTeamScenarioSimulation, type RoundOpponentForecast, type TeamScenarioResult } from '../../engine/monteCarlo'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useSelectionStore } from '../../store/useSelectionStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import type { GroupLetter } from '../../types/group'

const ROUND_LABEL_KO: Record<string, string> = {
  R32: '32강',
  R16: '16강',
  QF: '8강',
  SF: '4강',
  THIRD: '3·4위전',
  FINAL: '결승',
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
}

export function TeamDetailPage() {
  const teamId = useSelectionStore((s) => s.selectedTeamId)
  const clearTeam = useSelectionStore((s) => s.clearTeam)
  const drawGroups = useDrawStore((s) => s.state.groups)
  const { schedule, groupMatches, knockoutSlots } = useProgressStore()
  const simResult = useSimulationStore((s) => s.result)

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
      entries.push({
        key: `ko-${slot.slotId}`,
        label: ROUND_LABEL_KO[slot.round],
        opponentId,
        goalsFor,
        goalsAgainst,
        result: won ? 'W' : 'L',
        upset: isUpset(slot.result.winnerTeamId, loserTeamId),
      })
    }
    return entries
  }, [teamId, teamGroupMatches, knockoutSlots, schedule, drawGroups])

  const teamProbabilities = simResult && teamId ? simResult.probabilities[teamId] : null

  const playedGroupCount = teamGroupMatches.length
  const showScenario = playedGroupCount === 2

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
              {team.nameEn} · {CONFEDERATION_LABEL_KO[team.confederation]} · 포트 {team.pot}
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
                className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${
                  entry.upset ? 'bg-red-500/10 ring-1 ring-red-400/30' : 'bg-white/5'
                }`}
              >
                <span className="w-24 shrink-0 text-xs text-gray-400">
                  {entry.label}
                  {entry.date && <> · {formatKoreanDate(entry.date)}</>}
                </span>
                <span className="flex flex-1 items-center justify-center gap-2">
                  <TeamLink teamId={entry.opponentId} />
                  <span className="rounded bg-white/10 px-2 py-0.5 font-bold text-white">
                    {entry.goalsFor} - {entry.goalsAgainst}
                  </span>
                </span>
                <span className="flex w-20 shrink-0 items-center justify-end gap-1.5">
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
