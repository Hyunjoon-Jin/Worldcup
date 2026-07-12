import { useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { FlagIcon } from '../common/FlagIcon'
import { useQualificationStore } from '../../store/useQualificationStore'
import { computeStandings } from '../../engine/tiebreakers'
import { SLOT_ALLOCATION } from '../../data/confederations'
import { ALL_NATIONS_BY_ID } from '../../data/nations'

/** 예선 순위표용 국가 라벨(본선 상세 페이지로 이동하지 않음 — 비본선 국가 포함). */
function NationLabel({ teamId }: { teamId: string }) {
  const nation = ALL_NATIONS_BY_ID[teamId]
  if (!nation) return <span className="text-gray-100">{teamId}</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <FlagIcon iso2={nation.iso2} className="h-3 w-4 shrink-0" />
      <span className="font-medium text-gray-100">{nation.nameKo}</span>
    </span>
  )
}

/** 지역예선 화면 (Q3, 수직 슬라이스: CONMEBOL). 예선을 시뮬레이션하고 순위·통과 현황을 보여준다. */
export function QualificationStage() {
  const seed = useQualificationStore((s) => s.seed)
  const results = useQualificationStore((s) => s.results)
  const simulate = useQualificationStore((s) => s.simulate)
  const [seedInput, setSeedInput] = useState('')

  const conmebol = results.CONMEBOL
  const standings = conmebol ? computeStandings(conmebol.standings, conmebol.matches) : null
  const { direct, playoff } = SLOT_ALLOCATION.CONMEBOL

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">🌎 남미(CONMEBOL) 지역예선</p>
        <p className="mb-4 text-xs text-gray-400">
          10개국 단일리그(홈&어웨이) — 상위 <strong className="text-emerald-300">{direct}</strong>국 본선 직행,{' '}
          <strong className="text-amber-300">{playoff}</strong>국 대륙간 플레이오프
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
          <GlassButton onClick={() => simulate(seedInput)}>⚽ 예선 시뮬레이션</GlassButton>
        </div>
        {seed && <p className="mt-2 text-[11px] text-gray-500">예선 시드: <span className="font-mono text-emerald-300">{seed}</span></p>}
      </GlassCard>

      {!conmebol ? (
        <GlassCard className="p-8 text-center text-sm text-gray-400">
          아직 예선을 진행하지 않았습니다. "예선 시뮬레이션"을 눌러 남미 예선을 돌려보세요.
        </GlassCard>
      ) : (
        <GlassCard className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs sm:text-sm">
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
                {conmebol.standings.map((teamId, idx) => {
                  const s = standings![teamId]
                  const gd = s.goalsFor - s.goalsAgainst
                  const isDirect = idx < direct
                  const isPlayoff = idx >= direct && idx < direct + playoff
                  return (
                    <tr
                      key={teamId}
                      className={`border-t border-white/5 ${isDirect ? 'bg-emerald-500/10' : isPlayoff ? 'bg-amber-500/10' : ''}`}
                    >
                      <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                      <td className="py-1.5">
                        <NationLabel teamId={teamId} />
                      </td>
                      <td className="py-1.5 text-center text-gray-400 tabular-nums">{s.played}</td>
                      <td className="py-1.5 text-center font-bold text-white tabular-nums">{s.points}</td>
                      <td className="py-1.5 text-center text-gray-400 tabular-nums">
                        {gd > 0 ? `+${gd}` : gd}
                      </td>
                      <td className="py-1.5 text-right">
                        {isDirect ? (
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                            ✅ 본선 직행
                          </span>
                        ) : isPlayoff ? (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                            🎯 대륙간 PO
                          </span>
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
          <p className="mt-3 text-[11px] text-gray-500">
            ※ 조추첨 이후 본선과 마찬가지로, 예선 결과도 실제 대회와 무관한 가상 시뮬레이션입니다.
          </p>
        </GlassCard>
      )}
    </div>
  )
}
