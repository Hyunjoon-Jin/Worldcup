import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { useContinentalStore } from '../../store/useContinentalStore'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { useCareerStore } from '../../store/useCareerStore'
import { CUP_FORMATS, ALL_CUP_IDS, type CupId } from '../../data/continental/formats'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { buildSeasonTimeline } from '../../engine/season/seasonTimeline'
import type { CupGroupResult, CupKnockoutMatch } from '../../engine/continental/runCup'
import type { KnockoutRound } from '../../types/match'

const GROUP_LETTERS = 'ABCDEF'.split('')
const ROUND_LABEL: Record<KnockoutRound, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위전', FINAL: '결승' }
const MONTH_LABEL = { summer: '여름(6–7월)', january: '1월', winterAfcon: '겨울(12–1월)' } as const

function CupPickerCard({ id, onPick }: { id: CupId; onPick: (id: CupId) => void }) {
  const f = CUP_FORMATS[id]
  return (
    <button
      onClick={() => onPick(id)}
      className="rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/10"
    >
      <p className="text-sm font-bold text-gray-100">{f.nameKo}</p>
      <p className="mt-1 text-[11px] text-gray-400">
        {f.teams}팀 · {f.groups}개 조 · {f.knockout.map((r) => ROUND_LABEL[r]).join('→')}
      </p>
      <p className="mt-0.5 text-[11px] text-sky-300">{MONTH_LABEL[f.schedule.monthWindow]} · {f.confeds.join('/')}</p>
    </button>
  )
}

function fmtYmd(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}.${Number(m)}.${Number(d)}`
}

/** 시즌 일정: 이번 월드컵 사이클의 월드컵 본선 + 대륙컵을 개최 순서로 표시(충돌 없는 배치). */
function SeasonTimelineCard() {
  const wcYear = useCareerStore((s) => s.year)
  const events = useMemo(() => buildSeasonTimeline(wcYear), [wcYear])
  return (
    <GlassCard className="p-4">
      <h3 className="mb-1 text-sm font-bold text-gray-200">🗓 시즌 일정 <span className="text-[11px] font-normal text-gray-500">({wcYear} 사이클)</span></h3>
      <p className="mb-3 text-[11px] text-gray-500">월드컵과 6개 대륙컵은 서로 다른 시기에 열려 같은 팀의 경기가 겹치지 않습니다.</p>
      <div className="space-y-1.5">
        {events.map((e) => (
          <div key={`${e.id}-${e.year}`} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${e.kind === 'wc' ? 'bg-emerald-500/10' : 'bg-white/5'}`}>
            <span className="w-24 shrink-0 tabular-nums text-[11px] text-gray-400">{fmtYmd(e.start)}</span>
            <span className={`min-w-0 flex-1 font-medium ${e.kind === 'wc' ? 'text-emerald-200' : 'text-gray-200'}`}>{e.kind === 'wc' ? '🏆 ' : '🌍 '}{e.nameKo}</span>
            <span className="shrink-0 text-[10px] text-gray-500">{e.confeds === 'ALL' ? '전 대륙' : e.confeds.join('/')}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

function GroupTable({ group, format }: { group: CupGroupResult; format: (typeof CUP_FORMATS)[CupId] }) {
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const label = format.groups <= 6 ? `${GROUP_LETTERS[group.groupIndex]}조` : `${group.groupIndex + 1}조`
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
            {group.ranking.map((id, i) => {
              const s = group.standings[id]
              const gd = s.goalsFor - s.goalsAgainst
              const advanced = i < format.advancePerGroup
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

export function ContinentalStage() {
  const activeCupId = useContinentalStore((s) => s.activeCupId)
  const seed = useContinentalStore((s) => s.seed)
  const hostId = useContinentalStore((s) => s.hostId)
  const result = useContinentalStore((s) => s.result)
  const probabilities = useContinentalStore((s) => s.probabilities)
  const selectCup = useContinentalStore((s) => s.selectCup)
  const runActiveCup = useContinentalStore((s) => s.runActiveCup)
  const computeProbabilities = useContinentalStore((s) => s.computeProbabilities)
  const [seedInput, setSeedInput] = useState('')

  const format = activeCupId ? CUP_FORMATS[activeCupId] : null

  const koByRound = useMemo<Array<{ round: KnockoutRound; matches: CupKnockoutMatch[] }>>(() => {
    if (!result || !format) return []
    const rounds: KnockoutRound[] = [...format.knockout.filter((r) => r !== 'THIRD'), ...(format.thirdPlace ? (['THIRD'] as KnockoutRound[]) : [])]
    return rounds.map((round) => ({ round, matches: result.knockout.filter((m) => m.round === round) }))
  }, [result, format])

  const champProb = useMemo(() => {
    if (!probabilities) return []
    return Object.entries(probabilities.byTeam)
      .map(([teamId, p]) => ({ teamId, ...p }))
      .sort((a, b) => b.champion - a.champion)
      .slice(0, 8)
  }, [probabilities])

  if (!activeCupId || !format) {
    return (
      <div className="flex flex-col gap-5">
        <GlassCard strong className="p-5 text-center">
          <p className="mb-1 text-sm font-semibold text-white">🏆 대륙별 대표 대회</p>
          <p className="text-xs text-gray-400">각 대륙의 대표 대회를 월드컵과 동일하게 조추첨·조별리그·녹아웃까지 시뮬레이션합니다.</p>
        </GlassCard>
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-200">대회 선택</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_CUP_IDS.map((id) => (
              <CupPickerCard key={id} id={id} onPick={selectCup} />
            ))}
          </div>
        </GlassCard>
        <SeasonTimelineCard />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-5 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <button onClick={() => selectCup(null)} className="rounded-lg bg-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/20">← 대회 목록</button>
          <p className="text-sm font-bold text-white">🏆 {format.nameKo}</p>
        </div>
        <p className="mb-3 text-[11px] text-gray-400">
          {format.teams}팀 · {format.groups}개 조 · {format.knockout.map((r) => ROUND_LABEL[r]).join('→')}
          {format.thirdPlace ? ' (+3·4위전)' : ''} · {MONTH_LABEL[format.schedule.monthWindow]}
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
        {hostId && <p className="mt-2 text-[11px] text-sky-300">개최국: {ALL_NATIONS_BY_ID[hostId]?.nameKo ?? hostId}</p>}
        {seed && <p className="mt-2 text-[11px] text-gray-500">시드: <span className="font-mono text-emerald-300">{seed}</span></p>}
      </GlassCard>

      {!result ? (
        <GlassCard className="p-8 text-center text-sm text-gray-400">
          위 <strong className="text-gray-300">대회 시뮬레이션</strong>을 눌러 조추첨부터 우승까지 진행하세요.
        </GlassCard>
      ) : (
        <>
          <GlassCard strong className="p-5 text-center">
            <p className="text-[11px] text-gray-400">🏆 우승</p>
            <div className="my-1 flex items-center justify-center text-lg font-bold text-amber-300"><TeamLink teamId={result.champion} /></div>
            <p className="text-[11px] text-gray-500">준우승 <TeamLink teamId={result.runnerUp} />{result.third && <> · 3위 <TeamLink teamId={result.third} /></>}</p>
          </GlassCard>

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
            <h3 className="mb-3 text-sm font-bold text-gray-200">조별리그</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.groups.map((g) => (
                <GroupTable key={g.groupIndex} group={g} format={format} />
              ))}
            </div>
          </GlassCard>

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
        </>
      )}
    </div>
  )
}
