import { useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { FlagIcon } from '../common/FlagIcon'
import { useQualificationStore } from '../../store/useQualificationStore'
import { startFinalsFromQualification } from '../../store/tournamentActions'
import { computeStandings } from '../../engine/tiebreakers'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { CONFEDERATION_LABEL_KO } from '../../data/teams'
import type { Confederation } from '../../types/team'

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

function ConfederationStandings({ confed }: { confed: Confederation }) {
  const result = useQualificationStore((s) => s.result)
  const r = result?.byConfederation[confed]
  if (!r) return null
  const standings = computeStandings(r.standings, r.matches)
  const qSet = new Set(r.qualified)
  const pSet = new Set(r.playoff)

  return (
    <GlassCard className="p-4">
      {confed === 'CONCACAF' && (
        <p className="mb-2 text-[11px] text-gray-500">
          개최국(멕시코·미국·캐나다)은 예선 없이 자동 진출하며, 아래는 나머지 국가들의 최종 라운드입니다.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[500px] text-left text-xs sm:text-sm">
          <thead>
            <tr className="text-gray-400">
              <th className="w-8 py-1 text-center">#</th>
              <th className="py-1">국가</th>
              <th className="w-12 py-1 text-center">경기</th>
              <th className="w-12 py-1 text-center">승점</th>
              <th className="w-14 py-1 text-center">득실</th>
              <th className="py-1 text-right">결과</th>
            </tr>
          </thead>
          <tbody>
            {r.standings.map((teamId, idx) => {
              const s = standings[teamId]
              const gd = s.goalsFor - s.goalsAgainst
              const direct = qSet.has(teamId)
              const po = pSet.has(teamId)
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
                  <td className="py-1.5 text-right">
                    {direct ? (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">✅ 직행</span>
                    ) : po ? (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">🎯 대륙간 PO</span>
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
    </GlassCard>
  )
}

/** 지역예선 화면 (Q3/Q4). 6개 대륙 예선 + 대륙간 PO + 본선 48 확정 + 본선 조추첨 연결. */
export function QualificationStage({ onStartFinals }: { onStartFinals?: () => void }) {
  const seed = useQualificationStore((s) => s.seed)
  const result = useQualificationStore((s) => s.result)
  const simulate = useQualificationStore((s) => s.simulate)
  const [seedInput, setSeedInput] = useState('')
  const [confed, setConfed] = useState<Confederation>('UEFA')

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

          <ConfederationStandings confed={confed} />

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
          </GlassCard>
        </>
      )}
    </div>
  )
}
