import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { useContinentalStore, cupTotalStages } from '../../store/useContinentalStore'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { computeStandings, rankGroupTeams } from '../../engine/tiebreakers'
import { CUP_FORMATS, type CupId } from '../../data/continental/formats'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { buildCupPhases } from '../../engine/season/seasonTimeline'
import { BASE_FINALS_YEAR, formatKoreanDate } from '../../data/calendar'
import type { CupGroupResult, CupKnockoutMatch } from '../../engine/continental/runCup'
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

function GroupTable({ group, format, revealedMd }: { group: CupGroupResult; format: (typeof CUP_FORMATS)[CupId]; revealedMd: number }) {
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const label = format.groups <= 6 ? `${GROUP_LETTERS[group.groupIndex]}조` : `${group.groupIndex + 1}조`
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
    </div>
  )
}

function KnockoutMatchRow({ m }: { m: CupKnockoutMatch }) {
  const r = m.result
  const pk = r.wentToPenalties ? ` (PK ${r.homePenalties}-${r.awayPenalties})` : ''
  const homeWon = r.winnerTeamId === m.homeTeamId
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">
      <span className={`flex-1 text-right ${homeWon ? 'font-bold text-white' : 'text-gray-400'}`}><TeamLink teamId={m.homeTeamId} reverse /></span>
      <span className="shrink-0 font-mono text-[11px] text-gray-300">{r.homeGoals}-{r.awayGoals}{pk}</span>
      <span className={`flex-1 ${!homeWon ? 'font-bold text-white' : 'text-gray-400'}`}><TeamLink teamId={m.awayTeamId} /></span>
    </div>
  )
}

export function ContinentalStage({ onNavigateWC }: { onNavigateWC?: () => void }) {
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


  const koByRound = useMemo<Array<{ round: KnockoutRound; matches: CupKnockoutMatch[] }>>(() => {
    if (!result || !format) return []
    // 공개된 녹아웃 라운드만(3위전은 결승과 함께 마지막에 공개).
    const revealedRounds = format.knockout.slice(0, revealedKoRounds)
    const rounds: KnockoutRound[] = [
      ...revealedRounds.filter((r) => r !== 'THIRD'),
      ...(format.thirdPlace && revealedKoRounds >= format.knockout.length ? (['THIRD'] as KnockoutRound[]) : []),
    ]
    return rounds.map((round) => ({ round, matches: result.knockout.filter((m) => m.round === round) }))
  }, [result, format, revealedKoRounds])

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
          <GlassButton onClick={() => runActiveCup({ seed: seedInput })}>⚽ 대회 시뮬레이션</GlassButton>
          {result && <GlassButton variant="ghost" onClick={() => computeProbabilities()}>📊 우승 확률 계산</GlassButton>}
        </div>
        {seed && <p className="mt-2 text-[11px] text-gray-500">시드: <span className="font-mono text-emerald-300">{seed}</span></p>}
      </GlassCard>

      {/* 대회 일정(라운드별 날짜) — 대륙대회 일정 상세화 */}
      {cupPhases.length > 0 && (
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
          {/* 단계별 진행 컨트롤 (월드컵 '일정 진행'과 동형) */}
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

          {champProb.length > 0 && (
            <GlassCard className="p-4">
              <h3 className="mb-2 text-sm font-bold text-gray-200">📊 우승 확률 (상위 8)</h3>
              <div className="space-y-1">
                {champProb.map((t) => (
                  <div key={t.teamId} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1"><TeamLink teamId={t.teamId} /></span>
                    <span className="w-16 text-right tabular-nums text-gray-400">진출 {t.qualify.toFixed(0)}%</span>
                    <span className="w-16 text-right font-bold tabular-nums text-amber-300">우승 {t.champion.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          <GlassCard className="p-4">
            <h3 className="mb-3 text-sm font-bold text-gray-200">조별리그 <span className="text-[11px] font-normal text-gray-500">({revealedGroupMd}/3차전)</span></h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.groups.map((g) => (
                <GroupTable key={g.groupIndex} group={g} format={format} revealedMd={revealedGroupMd} />
              ))}
            </div>
          </GlassCard>

          {koByRound.length > 0 && (
            <GlassCard className="p-4">
              <h3 className="mb-3 text-sm font-bold text-gray-200">녹아웃</h3>
              <div className="space-y-3">
                {koByRound.map(({ round, matches }) => (
                  <div key={round}>
                    <p className="mb-1.5 font-display text-xs font-bold text-violet-200">{ROUND_LABEL[round]}</p>
                    <div className="space-y-1">
                      {matches.map((m) => (
                        <KnockoutMatchRow key={m.slotId} m={m} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </>
      )}
    </div>
  )
}
