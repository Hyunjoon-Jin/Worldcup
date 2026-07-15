import { useMemo } from 'react'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { CONFEDERATION_LABEL_KO } from '../../data/teams'
import { GlassCard } from '../common/GlassCard'
import { FlagIcon } from '../common/FlagIcon'
import { ProbBar } from '../probability/ProbBar'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useCareerStore } from '../../store/useCareerStore'
import { computeStandings, rankGroupTeams } from '../../engine/tiebreakers'
import { deriveQualStages, stageNameAt, stageNameOfGroup } from '../../engine/qualification/rules'
import { QUALIFY_KEY, INTER_PLAYOFF_KEY } from '../../engine/qualification/probability'
import { buildQualCalendar } from '../../engine/qualification/calendar'
import { formatKoreanDate } from '../../data/calendar'
import type { MatchResult } from '../../types/match'
import type { QualMatch } from '../../types/qualification'

// 예선 차수(스테이지) 진출 확률 막대 색: 차수는 앰버, 최종 본선진출은 에메랄드, 대륙간PO는 바이올렛.
function chainColor(key: string): string {
  if (key === QUALIFY_KEY) return '#34d399'
  if (key === INTER_PLAYOFF_KEY) return '#a78bfa'
  return '#fbbf24'
}

/** 예선 경기 한 줄(내 팀 관점). upcoming이면 결과를 숨기고 '예정'만 표기(스포일러 방지). */
function QualMatchRow({
  m,
  teamId,
  dateLabel,
  stageName,
  upcoming,
  onSelect,
}: {
  m: QualMatch
  teamId: string
  dateLabel: string | null
  stageName: string | null
  upcoming: boolean
  onSelect?: (m: MatchResult) => void
}) {
  const isHome = m.homeTeamId === teamId
  const oppId = isHome ? m.awayTeamId : m.homeTeamId
  const gf = isHome ? m.homeGoals : m.awayGoals
  const ga = isHome ? m.awayGoals : m.homeGoals
  const outcome = gf > ga ? '승' : gf < ga ? '패' : '무'
  const oColor = outcome === '승' ? 'text-emerald-300' : outcome === '패' ? 'text-red-300' : 'text-gray-400'
  const oBg = outcome === '승' ? 'bg-emerald-500/15' : outcome === '패' ? 'bg-red-500/15' : 'bg-white/10'
  return (
    <button
      type="button"
      onClick={() => !upcoming && onSelect?.(m)}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
        upcoming ? 'cursor-default bg-white/[0.03]' : 'bg-white/5 hover:bg-white/10'
      }`}
    >
      {upcoming ? (
        <span className="w-6 shrink-0 rounded bg-white/10 text-center text-[10px] font-bold text-gray-400">예정</span>
      ) : (
        <span className={`w-6 shrink-0 rounded text-center text-[10px] font-bold ${oColor} ${oBg}`}>{outcome}</span>
      )}
      <span className="w-24 shrink-0 truncate text-left text-[10px] text-gray-500">
        {stageName ? `${stageName} · ` : ''}R{m.matchday}
        {dateLabel ? ` · ${dateLabel}` : ''}
      </span>
      <span className="flex-1 truncate text-left text-gray-300">
        {isHome ? '' : '@ '}
        {ALL_NATIONS_BY_ID[oppId]?.nameKo ?? oppId}
      </span>
      {upcoming ? (
        <span className="shrink-0 text-[10px] text-gray-500">킥오프 전</span>
      ) : (
        <span className="shrink-0 font-bold tabular-nums text-white">
          {gf}-{ga}
        </span>
      )}
    </button>
  )
}

/**
 * 국가 상세 페이지의 '지역예선 현황'. 예선이 시뮬레이션돼 있으면 그 팀의 최근/예정 경기, 현재 조 순위,
 * 다음 라운드 진출 현황, 그리고 예선 차수별 진출 확률을 보여준다. 개최국(자동 진출)은 안내만 표시한다.
 */
export function TeamQualificationSection({
  teamId,
  onSelectMatch,
}: {
  teamId: string
  onSelectMatch?: (m: MatchResult) => void
}) {
  const result = useQualificationStore((s) => s.result)
  const revealedMap = useQualificationStore((s) => s.revealed)
  const stageProbs = useQualificationStore((s) => s.stageProbabilities)
  const friendlies = useQualificationStore((s) => s.friendlies)
  const wcYear = useCareerStore((s) => s.year)

  const team = ALL_NATIONS_BY_ID[teamId]
  const confed = team?.confederation
  const r = confed ? result?.byConfederation[confed] : undefined

  // 라운드(matchday) → 날짜 라벨. 전체 예선 캘린더에서 윈도우별 날짜를 뽑아 매핑한다(대회 연도 반영).
  const dateByMatchday = useMemo(() => {
    if (!result) return {} as Record<number, string>
    const cal = buildQualCalendar(result, wcYear)
    const map: Record<number, string> = {}
    for (const d of cal) map[d.windowIndex + 1] = d.date // 윈도우 w ↔ 라운드 w+1
    return map
  }, [result, wcYear])

  const view = useMemo(() => {
    if (!r || !confed) return null
    const teamMatches = r.matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    if (teamMatches.length === 0) return null
    const revealed = revealedMap[confed] ?? 0
    const total = r.matchdays
    const stages = deriveQualStages(r)

    const played = teamMatches.filter((m) => m.matchday <= revealed).sort((a, b) => b.matchday - a.matchday)
    // 아직 이 팀이 진출·조추첨을 확정하지 않은 '다음 차수' 경기는 예정에 넣지 않는다(상대가 확정된 것처럼
    // 보이는 스포일러 방지). 현재 차수(가장 최근/다음 경기가 속한 차수)의 종료 라운드까지만 예정으로 본다.
    const allUpcoming = teamMatches.filter((m) => m.matchday > revealed).sort((a, b) => a.matchday - b.matchday)
    const anchorMatch = played[0] ?? allUpcoming[0]
    const currentStage = anchorMatch ? stages.find((s) => anchorMatch.matchday >= s.startMd && anchorMatch.matchday <= s.endMd) : null
    const stageEndMd = currentStage?.endMd ?? total
    const upcoming = allUpcoming.filter((m) => m.matchday <= stageEndMd)

    // 현재 조 = 팀이 가장 최근에 치른(없으면 다음에 치를) 경기의 조. 그 조를 공개된 경기로 순위 매긴다.
    const groupIdx = anchorMatch ? anchorMatch.group : null
    const groupMembers = groupIdx != null ? (r.groups[groupIdx] ?? []) : []
    const groupPlayed = groupIdx != null ? r.matches.filter((m) => m.group === groupIdx && m.matchday <= revealed) : []
    const order = groupMembers.length > 0 ? rankGroupTeams(groupMembers, groupPlayed) : []
    const standings = computeStandings(groupMembers, groupPlayed)
    const myRank = order.indexOf(teamId) // 0-based

    const done = revealed >= total
    const finalStatus: 'qualified' | 'playoff' | 'eliminated' | null = done
      ? r.qualified.includes(teamId)
        ? 'qualified'
        : r.playoff.includes(teamId)
          ? 'playoff'
          : 'eliminated'
      : null

    // 차수별 진출 확률 체인: 대륙 차수 순서 + 본선진출 (+ 대륙간PO가 있으면).
    const teamProbs = stageProbs?.byTeam[teamId]
    const stageOrder = stageProbs?.stageOrderByConfed[confed] ?? stages.map((s) => s.name)
    const hasInterPlayoff = teamProbs != null && teamProbs[INTER_PLAYOFF_KEY] != null
    const chainKeys = teamProbs
      ? [...stageOrder, QUALIFY_KEY, ...(hasInterPlayoff ? [INTER_PLAYOFF_KEY] : [])]
      : []

    const currentStageName = groupIdx != null ? stageNameOfGroup(r, groupIdx) : null

    return {
      confed,
      total,
      revealed,
      stages,
      played,
      upcoming,
      groupMembers,
      order,
      standings,
      myRank,
      done,
      finalStatus,
      teamProbs,
      chainKeys,
      currentStageName,
      single: r.groups.length <= 1,
      groupLabel: groupIdx != null ? r.groupLabels?.[groupIdx] : undefined,
    }
  }, [r, confed, teamId, revealedMap, stageProbs])

  if (!team || !result) return null

  // 개최국(예선 없이 자동 진출).
  if (result.hosts.includes(teamId)) {
    return (
      <GlassCard className="p-4">
        <h3 className="mb-1 text-sm font-bold text-sky-300">🌍 지역예선 현황</h3>
        <p className="text-sm text-gray-300">
          {team.nameKo}은(는) 이번 대회 <strong className="text-sky-300">개최국</strong>으로 지역예선 없이 본선에
          자동 진출합니다.
        </p>
      </GlassCard>
    )
  }

  if (!view) return null

  const pct = (key: string): number => view.teamProbs?.[key] ?? 0
  const shortLabel = (key: string): string =>
    key === QUALIFY_KEY ? '본선 진출' : key === INTER_PLAYOFF_KEY ? '대륙간 PO' : key

  // 이 팀의 친선전(평가전) — 예선이 없던 경기일에 치른 경기. 전역 공개 경기일 기준으로 최근/예정 분리.
  const globalRevealed = Math.max(0, ...Object.values(revealedMap))
  const teamFriendlies = friendlies.filter((f) => f.homeTeamId === teamId || f.awayTeamId === teamId)
  const playedFriendlies = teamFriendlies.filter((f) => f.matchday <= globalRevealed).sort((a, b) => b.matchday - a.matchday)

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-sky-300">
          🌍 지역예선 현황 <span className="text-gray-500">· {CONFEDERATION_LABEL_KO[view.confed]}</span>
        </h3>
        <span className="text-[11px] text-gray-500">
          라운드 {Math.min(view.revealed, view.total)} / {view.total}
          {view.currentStageName && <span className="ml-1 text-emerald-300">· {view.currentStageName}</span>}
        </span>
      </div>

      {/* 다음 라운드 진출 현황 */}
      <div className="mb-3 rounded-lg bg-white/5 p-3">
        <p className="mb-1 text-[11px] font-bold text-gray-400">다음 라운드 진출 현황</p>
        {view.finalStatus ? (
          <p
            className={`text-sm font-bold ${
              view.finalStatus === 'qualified'
                ? 'text-emerald-300'
                : view.finalStatus === 'playoff'
                  ? 'text-violet-300'
                  : 'text-red-300'
            }`}
          >
            {view.finalStatus === 'qualified'
              ? '✅ 본선 직행 확정'
              : view.finalStatus === 'playoff'
                ? '🎟 대륙간 플레이오프 진출'
                : '❌ 예선 탈락'}
          </p>
        ) : view.myRank >= 0 ? (
          <p className="text-sm text-gray-200">
            현재 <strong className="text-white">{view.groupLabel ?? `조 순위`}</strong>{' '}
            <strong className="text-sky-300">{view.myRank + 1}위</strong>
            {view.teamProbs && (
              <span className="ml-1 text-gray-400">
                · 본선 진출 확률{' '}
                <strong className="text-emerald-300">{pct(QUALIFY_KEY).toFixed(1)}%</strong>
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-gray-400">아직 예선 경기가 시작되지 않았습니다.</p>
        )}
      </div>

      {/* 예선 차수별 진출 확률 */}
      {view.chainKeys.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-bold text-gray-400">예선 차수별 진출 확률</p>
          <div className="space-y-1.5">
            {view.chainKeys.map((key) => (
              <ProbBar key={key} pct={pct(key)} color={chainColor(key)} label={shortLabel(key)} />
            ))}
          </div>
        </div>
      )}

      {/* 현재 조 순위 */}
      {view.order.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-bold text-gray-400">
            현재 조 순위 {view.groupLabel && <span className="text-gray-500">({view.groupLabel})</span>}
          </p>
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-white/5 text-gray-500">
                  <th className="py-1 pl-2 text-left font-medium">#</th>
                  <th className="py-1 text-left font-medium">팀</th>
                  <th className="py-1 text-center font-medium">경기</th>
                  <th className="py-1 text-center font-medium">승무패</th>
                  <th className="py-1 text-center font-medium">득실</th>
                  <th className="py-1 pr-2 text-right font-medium">승점</th>
                </tr>
              </thead>
              <tbody>
                {view.order.map((id, i) => {
                  const s = view.standings[id]
                  const gd = s.goalsFor - s.goalsAgainst
                  const isTeam = id === teamId
                  return (
                    <tr key={id} className={isTeam ? 'bg-sky-500/15 font-bold text-white' : 'text-gray-300'}>
                      <td className="py-1 pl-2 tabular-nums text-gray-500">{i + 1}</td>
                      <td className="py-1">
                        <span className="flex items-center gap-1.5">
                          <FlagIcon iso2={ALL_NATIONS_BY_ID[id].iso2} className="h-3 w-4.5 shrink-0" />
                          <span className="truncate">{ALL_NATIONS_BY_ID[id].nameKo}</span>
                        </span>
                      </td>
                      <td className="py-1 text-center tabular-nums">{s.played}</td>
                      <td className="py-1 text-center tabular-nums text-gray-400">
                        {s.win}-{s.draw}-{s.loss}
                      </td>
                      <td className="py-1 text-center tabular-nums text-gray-400">
                        {gd > 0 ? '+' : ''}
                        {gd}
                      </td>
                      <td className="py-1 pr-2 text-right font-bold tabular-nums text-sky-300">{s.points}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 최근 경기 */}
      {view.played.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-bold text-gray-400">최근 경기</p>
          <div className="space-y-1">
            {view.played.slice(0, 5).map((m, i) => (
              <QualMatchRow
                key={`p${i}`}
                m={m}
                teamId={teamId}
                dateLabel={dateByMatchday[m.matchday] ? formatKoreanDate(dateByMatchday[m.matchday]) : null}
                stageName={stageNameAt(view.stages, m.matchday)}
                upcoming={false}
                onSelect={onSelectMatch}
              />
            ))}
          </div>
        </div>
      )}

      {/* 예정 경기 */}
      {view.upcoming.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold text-gray-400">예정 경기</p>
          <div className="space-y-1">
            {view.upcoming.slice(0, 5).map((m, i) => (
              <QualMatchRow
                key={`u${i}`}
                m={m}
                teamId={teamId}
                dateLabel={dateByMatchday[m.matchday] ? formatKoreanDate(dateByMatchday[m.matchday]) : null}
                stageName={stageNameAt(view.stages, m.matchday)}
                upcoming
              />
            ))}
          </div>
        </div>
      )}

      {/* 친선전(평가전) — 예선이 없던 경기일에 치른 경기 */}
      {playedFriendlies.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="mb-1.5 text-[11px] font-bold text-sky-300">🤝 친선전(평가전)</p>
          <div className="space-y-1">
            {playedFriendlies.slice(0, 5).map((f, i) => {
              const isHome = f.homeTeamId === teamId
              const gf = isHome ? f.homeGoals : f.awayGoals
              const ga = isHome ? f.awayGoals : f.homeGoals
              const oppId = isHome ? f.awayTeamId : f.homeTeamId
              const outcome = gf > ga ? '승' : gf < ga ? '패' : '무'
              const oColor = outcome === '승' ? 'text-emerald-300' : outcome === '패' ? 'text-red-300' : 'text-gray-400'
              const oBg = outcome === '승' ? 'bg-emerald-500/15' : outcome === '패' ? 'bg-red-500/15' : 'bg-white/10'
              return (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-sky-500/[0.05] px-2.5 py-1.5 text-xs">
                  <span className={`w-6 shrink-0 rounded text-center text-[10px] font-bold ${oColor} ${oBg}`}>{outcome}</span>
                  <span className="w-20 shrink-0 truncate text-left text-[10px] text-gray-500">
                    친선 · {dateByMatchday[f.matchday] ? formatKoreanDate(dateByMatchday[f.matchday]) : `R${f.matchday}`}
                  </span>
                  <span className="flex-1 truncate text-gray-300">
                    {isHome ? '' : '@ '}
                    {ALL_NATIONS_BY_ID[oppId]?.nameKo ?? oppId}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-white">
                    {gf}-{ga}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </GlassCard>
  )
}
