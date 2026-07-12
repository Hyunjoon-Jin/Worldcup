import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { FlagIcon } from '../common/FlagIcon'
import { useQualificationStore } from '../../store/useQualificationStore'
import { startFinalsFromQualification } from '../../store/tournamentActions'
import { computeStandings, rankGroupTeams } from '../../engine/tiebreakers'
import { extractQualDrama } from '../../engine/qualification/drama'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { CONFEDERATION_LABEL_KO } from '../../data/teams'
import { computePots } from '../../engine/drawEngine'
import { HOST_SLOTS } from '../../data/hostSlots'
import { QualMatchModal } from './QualMatchModal'
import type { Confederation } from '../../types/team'
import type { MatchResult } from '../../types/match'

/** 한 조의 경기 목록(접이식). 클릭 시 상세 모달을 연다 (F1). */
function MatchList({
  teams,
  matches,
  onSelectMatch,
}: {
  teams: string[]
  matches: MatchResult[]
  onSelectMatch: (m: MatchResult) => void
}) {
  const teamSet = new Set(teams)
  const groupMatches = matches.filter((m) => teamSet.has(m.homeTeamId) && teamSet.has(m.awayTeamId))
  if (groupMatches.length === 0) return null
  return (
    <details className="group mt-1.5">
      <summary className="cursor-pointer list-none text-[11px] text-gray-500 hover:text-gray-300">
        ⚽ 경기 결과 {groupMatches.length}경기 ▾
      </summary>
      <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {groupMatches.map((m, i) => (
          <button
            key={i}
            onClick={() => onSelectMatch(m)}
            className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1 text-[11px] hover:bg-white/10"
          >
            <span className="min-w-0 flex-1 truncate text-right text-gray-300">
              {ALL_NATIONS_BY_ID[m.homeTeamId]?.nameKo ?? m.homeTeamId}
            </span>
            <span className="shrink-0 font-bold tabular-nums text-white">
              {m.homeGoals}-{m.awayGoals}
            </span>
            <span className="min-w-0 flex-1 truncate text-gray-300">
              {ALL_NATIONS_BY_ID[m.awayTeamId]?.nameKo ?? m.awayTeamId}
            </span>
          </button>
        ))}
      </div>
    </details>
  )
}

const CONFEDS: Confederation[] = ['UEFA', 'CAF', 'AFC', 'CONMEBOL', 'CONCACAF', 'OFC']

function NationLabel({ teamId, className = '' }: { teamId: string; className?: string }) {
  const nation = ALL_NATIONS_BY_ID[teamId]
  if (!nation) return <span className="text-gray-100">{teamId}</span>
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <FlagIcon iso2={nation.iso2} className="h-3 w-4 shrink-0" />
      <span className="font-medium text-gray-100">{nation.nameKo}</span>
    </span>
  )
}

function ConfederationStandings({
  confed,
  onSelectMatch,
}: {
  confed: Confederation
  onSelectMatch: (m: MatchResult) => void
}) {
  const result = useQualificationStore((s) => s.result)
  const probabilities = useQualificationStore((s) => s.probabilities)
  const revealedMap = useQualificationStore((s) => s.revealed)
  const setRevealed = useQualificationStore((s) => s.setRevealed)
  const r = result?.byConfederation[confed]
  if (!r) return null
  const total = r.matchdays
  const revealed = revealedMap[confed] ?? total
  const full = revealed >= total
  const shownMatches = r.matches.filter((m) => m.matchday <= revealed)
  const standings = computeStandings(r.standings, shownMatches)
  const qSet = new Set(r.qualified)
  const pSet = new Set(r.playoff)
  const GROUP_LETTERS = 'ABCDEFGHIJKL'.split('')
  const single = r.groups.length <= 1

  return (
    <GlassCard className="p-4">
      {confed === 'CONCACAF' && (
        <p className="mb-3 text-[11px] text-gray-500">
          개최국(멕시코·미국·캐나다)은 예선 없이 자동 진출하며, 아래는 나머지 국가들의 최종 라운드입니다.
        </p>
      )}

      {/* 라운드별 진행 컨트롤 (B1) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-gray-300">
          라운드 <span className="text-emerald-300">{revealed}</span> / {total}
          {!full && <span className="ml-1 text-[10px] font-normal text-amber-300">진행 중</span>}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setRevealed(confed, 1)} disabled={revealed <= 1} className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:bg-white/20 disabled:opacity-30">⏮ 처음</button>
          <button onClick={() => setRevealed(confed, Math.max(1, revealed - 1))} disabled={revealed <= 1} className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:bg-white/20 disabled:opacity-30">◀</button>
          <button onClick={() => setRevealed(confed, Math.min(total, revealed + 1))} disabled={full} className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:bg-white/20 disabled:opacity-30">▶ 다음</button>
          <button onClick={() => setRevealed(confed, total)} disabled={full} className="rounded bg-emerald-500/20 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-30">⏭ 전체</button>
        </div>
      </div>

      <div className={single ? '' : 'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
        {r.groups.map((finalOrder, gi) => {
          const groupTeams = rankGroupTeams(finalOrder, shownMatches.filter((m) => m.group === gi))
          return (
          <div key={gi}>
            {!single && <p className="mb-1.5 font-display text-xs font-bold text-gray-300">{GROUP_LETTERS[gi]}조</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-left text-xs sm:text-sm">
                <thead>
                  <tr className="text-gray-400">
                    <th className="w-6 py-1 text-center">#</th>
                    <th className="py-1">국가</th>
                    <th className="w-10 py-1 text-center">경기</th>
                    <th className="w-10 py-1 text-center">승점</th>
                    <th className="w-12 py-1 text-center">득실</th>
                    {probabilities && <th className="w-14 py-1 text-right">진출</th>}
                    <th className="py-1 text-right">결과</th>
                  </tr>
                </thead>
                <tbody>
                  {groupTeams.map((teamId, idx) => {
                    const s = standings[teamId]
                    const gd = s.goalsFor - s.goalsAgainst
                    const direct = full && qSet.has(teamId)
                    const po = full && pSet.has(teamId)
                    return (
                      <tr
                        key={teamId}
                        className={`border-t border-white/5 ${direct ? 'bg-emerald-500/10' : po ? 'bg-amber-500/10' : ''}`}
                      >
                        <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                        <td className="py-1.5"><NationLabel teamId={teamId} /></td>
                        <td className="py-1.5 text-center text-gray-400 tabular-nums">{s.played}</td>
                        <td className="py-1.5 text-center font-bold text-white tabular-nums">{s.points}</td>
                        <td className="py-1.5 text-center text-gray-400 tabular-nums">{gd > 0 ? `+${gd}` : gd}</td>
                        {probabilities && (
                          <td className="py-1.5 text-right text-sky-300 tabular-nums">{(probabilities[teamId] ?? 0).toFixed(0)}%</td>
                        )}
                        <td className="py-1.5 text-right">
                          {!full ? (
                            <span className="text-[10px] text-gray-600">—</span>
                          ) : direct ? (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">✅ 직행</span>
                          ) : po ? (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">🎯 PO</span>
                          ) : (
                            <span className="text-[10px] text-gray-600">탈락</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <MatchList teams={groupTeams} matches={shownMatches} onSelectMatch={onSelectMatch} />
          </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-gray-500">
        {full
          ? single
            ? '※ 상위권 직행, 다음 순위 대륙간 PO로 결정됩니다.'
            : '※ 조 순위는 조별 성적, 직행/PO 여부는 전체 대륙 순위(조 1위 우선 → 최고 2위 …)로 결정됩니다.'
          : '※ 진행 중 — 라운드를 넘겨 순위 변화를 지켜보세요. 직행/PO는 전체 라운드 종료 후 확정됩니다.'}
      </p>
    </GlassCard>
  )
}

/** 지역예선 화면 (Q3/Q4). 6개 대륙 예선 + 대륙간 PO + 본선 48 확정 + 본선 조추첨 연결. */
export function QualificationStage({ onStartFinals }: { onStartFinals?: () => void }) {
  const seed = useQualificationStore((s) => s.seed)
  const result = useQualificationStore((s) => s.result)
  const simulate = useQualificationStore((s) => s.simulate)
  const probabilities = useQualificationStore((s) => s.probabilities)
  const probLoading = useQualificationStore((s) => s.probLoading)
  const computeProbabilities = useQualificationStore((s) => s.computeProbabilities)
  const [seedInput, setSeedInput] = useState('')
  const [confed, setConfed] = useState<Confederation>('UEFA')
  const [selMatch, setSelMatch] = useState<MatchResult | null>(null)

  const drama = useMemo(() => (result ? extractQualDrama(result) : null), [result])

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">🌍 월드컵 지역예선</p>
        <p className="mb-4 text-xs text-gray-400">
          6개 대륙 예선 + 대륙간 플레이오프를 시뮬레이션해 <strong className="text-emerald-300">본선 48개국</strong>을 가립니다.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <input
            type="text"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            placeholder="시드 (선택)"
            aria-label="예선 시드"
            className="w-36 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-emerald-400/50 focus:outline-none"
          />
          <GlassButton onClick={() => simulate(seedInput)}>⚽ 전체 예선 시뮬레이션</GlassButton>
        </div>
        {seed && <p className="mt-2 text-[11px] text-gray-500">예선 시드: <span className="font-mono text-emerald-300">{seed}</span></p>}
      </GlassCard>

      {!result ? (
        <GlassCard className="p-8 text-center text-sm text-gray-400">
          아직 예선을 진행하지 않았습니다. "전체 예선 시뮬레이션"을 눌러보세요.
        </GlassCard>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {CONFEDS.map((c) => (
                <button
                  key={c}
                  onClick={() => setConfed(c)}
                  aria-pressed={confed === c}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    confed === c ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  {CONFEDERATION_LABEL_KO[c]}
                </button>
              ))}
            </div>
            <GlassButton variant="ghost" onClick={computeProbabilities} disabled={probLoading}>
              {probLoading ? '진출 확률 계산 중…' : probabilities ? '🔄 진출 확률 재계산' : '📊 본선 진출 확률'}
            </GlassButton>
          </div>

          <ConfederationStandings confed={confed} onSelectMatch={setSelMatch} />

          <GlassCard className="p-4">
            <h3 className="mb-3 text-sm font-bold text-amber-300">🎯 대륙간 플레이오프 (6팀 → 2장)</h3>
            <div className="mb-3 flex flex-wrap gap-2">
              {result.interConfed.participants.map((id) => (
                <span
                  key={id}
                  className={`rounded-lg px-2 py-1 text-xs ${
                    result.interConfed.winners.includes(id) ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/5 text-gray-400'
                  }`}
                >
                  <NationLabel teamId={id} />
                  {result.interConfed.winners.includes(id) && ' ✅'}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-gray-500">
              최종 진출:{' '}
              {result.interConfed.winners.map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join(', ')}
            </p>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-emerald-300">
                🏆 본선 진출 48개국 <span className="text-gray-500">({result.qualified48.length})</span>
              </h3>
              <GlassButton
                onClick={() => {
                  startFinalsFromQualification(result.qualified48, seed ?? undefined)
                  onStartFinals?.()
                }}
              >
                이 결과로 본선 조추첨 시작 →
              </GlassButton>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {result.qualified48.map((id) => (
                <div key={id} className="flex items-center gap-1.5 text-xs">
                  <NationLabel teamId={id} />
                  {result.hosts.includes(id) && <span className="text-[9px] text-sky-300">개최</span>}
                </div>
              ))}
            </div>

            <details className="group mt-4 border-t border-white/10 pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-gray-300">
                <span>🎩 본선 포트 배정 미리보기 (랭킹 기준)</span>
                <span className="text-gray-500 transition-transform group-open:rotate-180">▾</span>
              </summary>
              {(() => {
                const pots = computePots(result.qualified48)
                const hostIds = Object.keys(HOST_SLOTS)
                const potList: [string, string[]][] = [
                  ['포트 1 (개최국 + 최상위 9)', [...hostIds, ...pots[1]]],
                  ['포트 2', pots[2]],
                  ['포트 3', pots[3]],
                  ['포트 4', pots[4]],
                ]
                return (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {potList.map(([label, ids]) => (
                      <div key={label}>
                        <p className="mb-1.5 text-[11px] font-bold text-emerald-300">{label}</p>
                        <div className="space-y-0.5">
                          {ids.map((id) => (
                            <div key={id} className="flex items-center gap-1.5 text-[11px]">
                              <NationLabel teamId={id} />
                              {hostIds.includes(id) && <span className="text-[9px] text-sky-300">개최</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </details>
          </GlassCard>

          {drama && (drama.surpriseQualifiers.length > 0 || drama.shockEliminations.length > 0) && (
            <GlassCard className="p-4">
              <h3 className="mb-3 text-sm font-bold text-amber-300">🎭 예선 이변</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-[11px] font-bold text-emerald-300">🐎 깜짝 본선행 (랭킹 낮은데 진출)</p>
                  <div className="space-y-1">
                    {drama.surpriseQualifiers.map((d) => (
                      <div key={d.teamId} className="flex items-center justify-between text-xs">
                        <NationLabel teamId={d.teamId} />
                        <span className="text-[10px] text-gray-500">FIFA {d.rank}위</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-bold text-red-300">💥 충격 탈락 (랭킹 높은데 탈락)</p>
                  <div className="space-y-1">
                    {drama.shockEliminations.map((d) => (
                      <div key={d.teamId} className="flex items-center justify-between text-xs">
                        <NationLabel teamId={d.teamId} />
                        <span className="text-[10px] text-gray-500">FIFA {d.rank}위</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </GlassCard>
          )}

          <GlassCard className="p-4">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-gray-200">
                <span>📖 예선 규정 도움말</span>
                <span className="text-xs text-gray-500 transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-gray-400">
                <p>
                  <strong className="text-emerald-300">슬롯 배분:</strong> UEFA 16 · CAF 9 · AFC 8 · CONMEBOL 6 ·
                  CONCACAF 6(개최 3국 포함) · OFC 1 = 46 직행. 여기에 대륙간 플레이오프 2장을 더해 총 48개국.
                </p>
                <p>
                  <strong className="text-emerald-300">개최국:</strong> 미국·멕시코·캐나다는 예선 없이 자동 진출합니다.
                </p>
                <p>
                  <strong className="text-emerald-300">대륙간 플레이오프:</strong> 각 대륙의 PO행 팀(총 6팀)이
                  시드 브래킷으로 맞붙어 2장을 가립니다.
                </p>
                <p>세부 포맷은 시뮬레이션에 맞게 근사했으며, 조추첨 이후처럼 예선 결과도 실제 대회와 무관한 가상 시뮬레이션입니다.</p>
              </div>
            </details>
          </GlassCard>
        </>
      )}

      {selMatch && <QualMatchModal match={selMatch} onClose={() => setSelMatch(null)} />}
    </div>
  )
}
