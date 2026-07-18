import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { useContinentalStore, cupTotalStages } from '../../store/useContinentalStore'
import { cupRankByTeam } from '../../store/seasonActions'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { computeStandings, rankGroupTeams } from '../../engine/tiebreakers'
import { CUP_FORMATS, type CupId } from '../../data/continental/formats'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { buildCupPhases } from '../../engine/season/seasonTimeline'
import { BASE_FINALS_YEAR, formatKoreanDate } from '../../data/calendar'
import { CupBracketView } from './CupBracketView'
import { useMatchDetailStore, type MatchDetailRef } from '../../store/useMatchDetailStore'
import type { CupGroupResult } from '../../engine/continental/runCup'
import type { KnockoutRound } from '../../types/match'

const GROUP_LETTERS = 'ABCDEF'.split('')
const ROUND_LABEL: Record<KnockoutRound, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위전', FINAL: '결승' }
const MONTH_LABEL = { summer: '여름(6–7월)', january: '1월', winterAfcon: '겨울(12–1월)' } as const

function QualSummaryCard() {
  const qualResult = useContinentalStore((s) => s.qualResult)
  const [open, setOpen] = useState(false)
  if (!qualResult) return null
  const { autoQualified, earned, groups } = qualResult
  return (
    <GlassCard className="p-4">
      <h3 className="mb-2 text-sm font-bold text-gray-200">🎫 예선 결과 <span className="text-[11px] font-normal text-gray-500">(자동 {autoQualified.length} · 통과 {earned.length})</span></h3>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {autoQualified.map((id) => (
          <span key={id} className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] text-sky-200"><TeamLink teamId={id} /> <span className="text-[9px] text-sky-300/70">자동</span></span>
        ))}
        {earned.map((id) => (
          <span key={id} className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-200"><TeamLink teamId={id} /> <span className="text-[9px] text-emerald-300/70">통과</span></span>
        ))}
      </div>
      {groups.length > 0 && (
        <>
          <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-gray-400 hover:text-gray-200">
            {open ? '▲ 예선 조별 결과 접기' : `▼ 예선 조별 결과 보기 (${groups.length}개 조)`}
          </button>
          {open && (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g, gi) => (
                <div key={gi}>
                  <p className="mb-1 text-[11px] font-bold text-gray-400">예선 {gi + 1}조</p>
                  <div className="space-y-0.5">
                    {g.ranking.map((id, i) => {
                      const s = g.standings[id]
                      return (
                        <div key={id} className="flex items-center gap-2 text-[11px]">
                          <span className="w-4 text-center text-gray-500">{i + 1}</span>
                          <span className="min-w-0 flex-1"><TeamLink teamId={id} /></span>
                          <span className="tabular-nums text-gray-400">{s.points}점</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </GlassCard>
  )
}

/** 확률 셀 — 배경 막대 + 퍼센트(월드컵 확률 대시보드와 동형 시각). */
function ProbCell({ value, highlight }: { value: number; highlight?: boolean }) {
  return (
    <td className="px-1 py-1">
      <div className="relative h-5 w-full min-w-[52px] overflow-hidden rounded bg-white/5">
        <div className={`absolute inset-y-0 left-0 rounded ${highlight ? 'bg-amber-400/30' : 'bg-emerald-400/25'}`} style={{ width: `${Math.min(100, value)}%` }} />
        <span className={`absolute inset-0 flex items-center justify-center tabular-nums ${highlight ? 'font-bold text-amber-200' : 'text-gray-200'}`}>{value >= 10 ? value.toFixed(0) : value.toFixed(1)}%</span>
      </div>
    </td>
  )
}

const cupGroupRef = (m: CupGroupResult['matches'][number]): MatchDetailRef => ({
  kind: 'group',
  external: true,
  match: { group: 'A', matchday: 1, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals },
})

function GroupTable({ group, format, revealedMd }: { group: CupGroupResult; format: (typeof CUP_FORMATS)[CupId]; revealedMd: number }) {
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)
  const label = format.groups <= 6 ? `${GROUP_LETTERS[group.groupIndex]}조` : `${group.groupIndex + 1}조`
  const playedMatches = group.matches.filter((m) => m.matchday <= revealedMd)
  // 공개된 경기일까지만 반영한 잠정 순위(월드컵 조별 진행과 동일).
  const { ranking, standings, groupDone } = useMemo(() => {
    const played = group.matches.filter((m) => m.matchday <= revealedMd)
    return {
      ranking: rankGroupTeams(group.teams, played, format.groupTiebreak),
      standings: computeStandings(group.teams, played),
      groupDone: revealedMd >= 3,
    }
  }, [group, revealedMd, format.groupTiebreak])
  return (
    <div>
      <p className="mb-1.5 font-display text-xs font-bold text-gray-300">{label}</p>
      <div className="overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-white/5 text-gray-500">
              <th className="w-5 py-1 text-center">#</th>
              <th className="py-1 text-left">국가</th>
              <th className="w-8 py-1 text-center">경기</th>
              <th className="w-12 py-1 text-center">승무패</th>
              <th className="w-10 py-1 text-center">득실</th>
              <th className="w-8 py-1 text-right pr-2">점</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((id, i) => {
              const s = standings[id]
              const gd = s.goalsFor - s.goalsAgainst
              const advanced = groupDone && i < format.advancePerGroup
              return (
                <tr key={id} className={`border-t border-white/5 ${id === myTeamId ? 'bg-sky-500/15' : advanced ? 'bg-emerald-500/10' : ''}`}>
                  <td className="py-1 text-center text-gray-500">{i + 1}</td>
                  <td className="py-1"><span className="inline-flex items-center gap-1"><TeamLink teamId={id} />{advanced && <span className="text-[8px] text-emerald-300">진출</span>}</span></td>
                  <td className="py-1 text-center tabular-nums text-gray-400">{s.played}</td>
                  <td className="py-1 text-center tabular-nums text-gray-400">{s.win}-{s.draw}-{s.loss}</td>
                  <td className="py-1 text-center tabular-nums text-gray-400">{gd > 0 ? `+${gd}` : gd}</td>
                  <td className="py-1 text-right pr-2 font-bold tabular-nums text-white">{s.points}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {playedMatches.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {playedMatches.map((m, i) => {
            const mine = m.homeTeamId === myTeamId || m.awayTeamId === myTeamId
            return (
              <button
                key={i}
                onClick={() => selectMatch(cupGroupRef(m))}
                className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] transition-colors hover:bg-white/15 ${mine ? 'bg-sky-500/10' : 'bg-white/5'}`}
              >
                <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-right"><TeamLink teamId={m.homeTeamId} reverse wrap className="min-w-0" /></span>
                <span className="shrink-0 rounded bg-white/10 px-1 py-0.5 font-bold tabular-nums text-white">{m.homeGoals}-{m.awayGoals}</span>
                <span className="flex min-w-0 flex-1 items-center gap-1"><TeamLink teamId={m.awayTeamId} wrap className="min-w-0" /></span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** 대륙컵 본선 하위 화면(월드컵과 동일 수준): 조추첨(조편성)/진행·일정/조별리그/토너먼트/확률. */
export type ContinentalView = 'draw' | 'progress' | 'groups' | 'knockout' | 'probability'

export function ContinentalStage({ onNavigateWC, view = 'progress' }: { onNavigateWC?: () => void; view?: ContinentalView }) {
  const activeCupId = useContinentalStore((s) => s.activeCupId)
  const seed = useContinentalStore((s) => s.seed)
  const hostIds = useContinentalStore((s) => s.hostIds)
  const cupYear = useContinentalStore((s) => s.cupYear)
  const result = useContinentalStore((s) => s.result)
  const probabilities = useContinentalStore((s) => s.probabilities)
  const stage = useContinentalStore((s) => s.stage)
  const runActiveCup = useContinentalStore((s) => s.runActiveCup)
  const advanceStage = useContinentalStore((s) => s.advanceStage)
  const advanceToEnd = useContinentalStore((s) => s.advanceToEnd)
  const computeProbabilities = useContinentalStore((s) => s.computeProbabilities)
  const [seedInput, setSeedInput] = useState('')

  const format = activeCupId ? CUP_FORMATS[activeCupId] : null

  // 대회 일정(라운드별 날짜) — 대륙대회 일정 상세화.
  const cupPhases = useMemo(
    () => (activeCupId ? buildCupPhases(activeCupId, cupYear ?? BASE_FINALS_YEAR) : []),
    [activeCupId, cupYear],
  )

  // 단계별 공개(월드컵 '일정 진행'과 동형): 0=조추첨, 1~3=조별 MD, 4~=녹아웃 라운드.
  const totalStages = activeCupId ? cupTotalStages(activeCupId) : 0
  const revealedGroupMd = Math.min(stage, 3)
  const revealedKoRounds = Math.max(0, stage - 3)
  const fullyRevealed = result != null && stage >= totalStages
  const stageLabel = ((): string => {
    if (!result || !format) return ''
    if (stage === 0) return '조추첨 완료 — 조편성 공개'
    if (stage <= 3) return `조별리그 ${stage}차전`
    const koIdx = stage - 4
    const r = format.knockout[koIdx]
    return r ? `녹아웃 — ${ROUND_LABEL[r]}` : '대회 종료'
  })()


  // 확률 체인에 표시할 녹아웃 라운드(3·4위전 제외, 결승은 '우승'으로 대체하므로 제외).
  const probChainRounds = useMemo<KnockoutRound[]>(
    () => (format ? format.knockout.filter((r) => r !== 'THIRD' && r !== 'FINAL') : []),
    [format],
  )

  // 조추첨 포트(시드 등급) 복원 — 본선 조 시딩은 기본 능력치순 포트(teamsPerGroup개)로 이뤄진다.
  // 각 포트 = 능력치 상위부터 groups명씩. 팀별 소속 포트·배정 조를 함께 계산해 조추첨을 시각화한다.
  const drawInfo = useMemo(() => {
    if (!result || !format) return null
    const field = result.groups.flatMap((g) => g.teams)
    const sorted = [...field].sort((a, b) => (ALL_NATIONS_BY_ID[b]?.baseRatings.overall ?? 0) - (ALL_NATIONS_BY_ID[a]?.baseRatings.overall ?? 0) || a.localeCompare(b))
    const pots: string[][] = []
    for (let p = 0; p < format.teamsPerGroup; p++) pots.push(sorted.slice(p * format.groups, (p + 1) * format.groups))
    const potOf = new Map<string, number>()
    pots.forEach((pot, pi) => pot.forEach((t) => potOf.set(t, pi)))
    const groupOf = new Map<string, number>()
    result.groups.forEach((g) => g.teams.forEach((t) => groupOf.set(t, g.groupIndex)))
    return { pots, potOf, groupOf }
  }, [result, format])

  const champProb = useMemo(() => {
    if (!probabilities) return []
    return Object.entries(probabilities.byTeam)
      .map(([teamId, p]) => ({ teamId, ...p }))
      .sort((a, b) => b.champion - a.champion)
      .slice(0, 8)
  }, [probabilities])

  if (!activeCupId || !format) {
    // 캘린더 축: 대회를 임의로 고를 수 없다. 다가온 대회만 캘린더에서 진입한다.
    return (
      <div className="flex flex-col gap-5">
        <GlassCard strong className="p-5 text-center">
          <p className="mb-1 text-sm font-semibold text-white">🏆 대륙별 대표 대회</p>
          <p className="text-xs text-gray-400">각 대륙의 대표 대회를 월드컵과 동일하게 조추첨·조별리그·녹아웃까지 시뮬레이션합니다.</p>
        </GlassCard>
        <GlassCard className="p-8 text-center">
          <p className="text-sm text-gray-300">진행 중인 대륙컵이 없습니다.</p>
          <p className="mt-1 text-[11px] text-gray-500">대회는 캘린더의 일정 순서대로 다가옵니다. <strong className="text-emerald-300">캘린더</strong> 탭에서 다가온 일정을 진행하세요.</p>
          {onNavigateWC && (
            <GlassButton variant="ghost" className="mt-3" onClick={onNavigateWC}>← 캘린더로</GlassButton>
          )}
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-5 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <p className="text-sm font-bold text-white">🏆 {format.nameKo}{cupYear ? ` ${cupYear}` : ''}</p>
        </div>
        <p className="mb-3 text-[11px] text-gray-400">
          {format.teams}팀 · {format.groups}개 조 · {format.knockout.map((r) => ROUND_LABEL[r]).join('→')}
          {format.thirdPlace ? ' (+3·4위전)' : ''} · {MONTH_LABEL[format.schedule.monthWindow]}
        </p>
        {format.qual.style === 'combinedWcq' && (
          <p className="mb-3 text-[11px] text-amber-300/90">🔗 예선은 월드컵 지역예선과 통합 진행됩니다 — 월드컵 예선 성적으로 본선 진출국이 결정됩니다.</p>
        )}
        {format.qual.style === 'nationsLeague' && (
          <p className="mb-3 text-[11px] text-amber-300/90">🔗 예선은 CONCACAF 네이션스리그로 치릅니다 — 상위 리그는 직행, 나머지는 프렐림 플레이오프로 결정됩니다.</p>
        )}
        {/* 개최국은 에디션별로 경제·지역을 고려해 자동 선정된다(공동개최 가능). */}
        <p className="mb-3 text-[11px] text-sky-300">
          🏟️ 개최{hostIds.length > 1 ? '(공동)' : ''}: {hostIds.length > 0 ? hostIds.map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join(' · ') : '미정'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <input
            type="text"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            placeholder="시드 (선택)"
            aria-label="대회 시드"
            className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-emerald-400/50 focus:outline-none"
          />
          <GlassButton onClick={() => runActiveCup({ seed: seedInput, rankByTeam: cupRankByTeam(activeCupId) })}>⚽ 대회 시뮬레이션</GlassButton>
          {result && <GlassButton variant="ghost" onClick={() => computeProbabilities()}>📊 우승 확률 계산</GlassButton>}
        </div>
        {seed && <p className="mt-2 text-[11px] text-gray-500">시드: <span className="font-mono text-emerald-300">{seed}</span></p>}
      </GlassCard>

      {/* 대회 일정(라운드별 날짜) — 대륙대회 일정 상세화 (진행·일정 뷰) */}
      {view === 'progress' && cupPhases.length > 0 && (
        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-bold text-gray-200">📅 대회 일정 <span className="text-[11px] font-normal text-gray-500">({cupYear ?? BASE_FINALS_YEAR} · {MONTH_LABEL[format.schedule.monthWindow]})</span></h3>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {cupPhases.map((p) => (
              <div key={p.key} className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px]">
                <span className="text-gray-300">{p.label}</span>
                <span className="tabular-nums text-gray-400">{formatKoreanDate(p.start)}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {!result ? (
        <GlassCard className="p-8 text-center text-sm text-gray-400">
          위 <strong className="text-gray-300">대회 시뮬레이션</strong>을 눌러 조추첨부터 우승까지 진행하세요.
        </GlassCard>
      ) : (
        <>
          {/* 진행·일정: 단계별 진행 컨트롤 (월드컵 '일정 진행'과 동형) + 예선 요약 */}
          {view === 'progress' && (
            <>
              <GlassCard strong className="p-5">
                <p className="mb-2 text-center text-sm font-semibold text-white">{fullyRevealed ? '✅ 대회 종료' : `🗓 ${stageLabel}`}</p>
                <div className="mx-auto mb-1 h-2 max-w-md overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-[width]" style={{ width: `${Math.round((stage / totalStages) * 100)}%` }} />
                </div>
                <p className="mb-3 text-center text-[10px] text-gray-500">{stage} / {totalStages} 단계</p>
                {!fullyRevealed && (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <GlassButton onClick={advanceStage}>▶ 다음 단계 진행</GlassButton>
                    <GlassButton variant="ghost" onClick={advanceToEnd}>⏭ 끝까지 진행</GlassButton>
                  </div>
                )}
              </GlassCard>
              <QualSummaryCard />
              {fullyRevealed && (
                <GlassCard strong className="p-5 text-center">
                  <p className="text-[11px] text-gray-400">🏆 우승</p>
                  <div className="my-1 flex items-center justify-center text-lg font-bold text-amber-300"><TeamLink teamId={result.champion} /></div>
                  <p className="text-[11px] text-gray-500">준우승 <TeamLink teamId={result.runnerUp} />{result.third && <> · 3위 <TeamLink teamId={result.third} /></>}</p>
                </GlassCard>
              )}
            </>
          )}

          {/* 조추첨: 포트(시드) 구성 + 본선 조편성 (월드컵 조추첨과 동형) */}
          {view === 'draw' && (
            <>
              <GlassCard className="p-4">
                <h3 className="mb-1 text-sm font-bold text-gray-200">🎡 시드 포트 <span className="text-[11px] font-normal text-gray-500">(능력치 등급별 · 각 포트에서 조마다 1팀)</span></h3>
                <p className="mb-3 text-[11px] text-gray-500">능력치 상위부터 {format.groups}팀씩 같은 포트로 묶어, 각 조에 포트마다 한 팀씩 배정합니다. 괄호는 배정된 조입니다.</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {drawInfo?.pots.map((pot, pi) => (
                    <GlassCard key={pi} className="p-3">
                      <p className="mb-2 text-xs font-bold text-sky-200">포트 {pi + 1}</p>
                      <div className="space-y-1">
                        {pot.map((tid) => (
                          <div key={tid} className="flex items-center justify-between gap-1 text-[11px]">
                            <TeamLink teamId={tid} wrap className="min-w-0" />
                            <span className="shrink-0 text-[9px] font-bold text-emerald-300/80">{String.fromCharCode(65 + (drawInfo.groupOf.get(tid) ?? 0))}조</span>
                          </div>
                        ))}
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </GlassCard>
              <GlassCard className="p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-200">🎲 본선 조편성 <span className="text-[11px] font-normal text-gray-500">(조추첨 결과 · 숫자=포트)</span></h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {result.groups.map((g) => (
                    <GlassCard key={g.groupIndex} className="p-3">
                      <p className="mb-2 text-xs font-bold text-emerald-200">{String.fromCharCode(65 + g.groupIndex)}조</p>
                      <div className="space-y-1">
                        {g.teams.map((tid) => (
                          <div key={tid} className="flex items-center gap-1.5 text-[11px]">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-sky-500/20 text-[8px] font-bold text-sky-300">{(drawInfo?.potOf.get(tid) ?? 0) + 1}</span>
                            <TeamLink teamId={tid} wrap className="min-w-0" />
                          </div>
                        ))}
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </GlassCard>
            </>
          )}

          {/* 조별리그 */}
          {view === 'groups' && (
            <GlassCard className="p-4">
              <h3 className="mb-3 text-sm font-bold text-gray-200">조별리그 <span className="text-[11px] font-normal text-gray-500">({revealedGroupMd}/3차전)</span></h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {result.groups.map((g) => (
                  <GroupTable key={g.groupIndex} group={g} format={format} revealedMd={revealedGroupMd} />
                ))}
              </div>
            </GlassCard>
          )}

          {/* 토너먼트(녹아웃) + 우승 */}
          {view === 'knockout' && (
            <>
              {fullyRevealed && (
                <GlassCard strong className="p-5 text-center">
                  <p className="text-[11px] text-gray-400">🏆 우승</p>
                  <div className="my-1 flex items-center justify-center text-lg font-bold text-amber-300"><TeamLink teamId={result.champion} /></div>
                  <p className="text-[11px] text-gray-500">준우승 <TeamLink teamId={result.runnerUp} />{result.third && <> · 3위 <TeamLink teamId={result.third} /></>}</p>
                </GlassCard>
              )}
              <GlassCard className="p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-200">녹아웃 대진표 <span className="text-[11px] font-normal text-gray-500">(경기를 누르면 상세)</span></h3>
                <CupBracketView knockout={result.knockout} format={format} revealedRounds={revealedKoRounds} />
              </GlassCard>
            </>
          )}

          {/* 확률 — 진출 체인(조별 통과 → 각 라운드 도달 → 우승), 월드컵 확률 대시보드와 동형 */}
          {view === 'probability' && (
            champProb.length > 0 ? (
              <GlassCard className="p-4">
                <h3 className="mb-1 text-sm font-bold text-gray-200">📊 진출 체인 확률 <span className="text-[11px] font-normal text-gray-500">(상위 8 · {probabilities?.iterations.toLocaleString()}회 시뮬)</span></h3>
                <p className="mb-3 text-[11px] text-gray-500">조별 통과부터 우승까지 각 단계 도달 확률입니다. 막대가 길수록 확률이 높습니다.</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-[11px]">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="px-1 py-1 text-left font-medium">팀</th>
                        <th className="px-1 py-1 text-center font-medium">조별 통과</th>
                        {probChainRounds.map((r) => (
                          <th key={r} className="px-1 py-1 text-center font-medium">{ROUND_LABEL[r]} 진출</th>
                        ))}
                        <th className="px-1 py-1 text-center font-medium text-amber-300">우승</th>
                      </tr>
                    </thead>
                    <tbody>
                      {champProb.map((t) => (
                        <tr key={t.teamId} className="border-t border-white/5">
                          <td className="px-1 py-1"><TeamLink teamId={t.teamId} wrap className="min-w-0" /></td>
                          <ProbCell value={t.qualify} />
                          {probChainRounds.map((r) => (
                            <ProbCell key={r} value={t.reach?.[r] ?? 0} />
                          ))}
                          <ProbCell value={t.champion} highlight />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            ) : (
              <GlassCard className="p-8 text-center text-[11px] text-gray-500">위 <strong className="text-gray-300">📊 우승 확률 계산</strong>을 눌러 확률을 계산하세요.</GlassCard>
            )
          )}
        </>
      )}
    </div>
  )
}
