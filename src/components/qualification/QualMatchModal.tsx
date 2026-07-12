import { GlassCard } from '../common/GlassCard'
import { FlagIcon } from '../common/FlagIcon'
import { getRatings } from '../../engine/matchEngine'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import type { MatchResult } from '../../types/match'

function RatingRow({ label, home, away }: { label: string; home: number; away: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-10 text-right font-bold ${home > away ? 'text-emerald-300' : 'text-gray-300'}`}>{home}</span>
      <div className="flex-1 text-center text-gray-500">{label}</div>
      <span className={`w-10 text-left font-bold ${away > home ? 'text-emerald-300' : 'text-gray-300'}`}>{away}</span>
    </div>
  )
}

/** 예선 경기 상세 모달 (F1). 비본선국 포함 안전하게 팀·스코어·전력 비교를 보여준다. */
export function QualMatchModal({ match, onClose }: { match: MatchResult; onClose: () => void }) {
  const home = ALL_NATIONS_BY_ID[match.homeTeamId]
  const away = ALL_NATIONS_BY_ID[match.awayTeamId]
  if (!home || !away) return null
  const hr = getRatings(match.homeTeamId)
  const ar = getRatings(match.awayTeamId)
  const favored =
    hr.overall === ar.overall ? null : hr.overall > ar.overall ? match.homeTeamId : match.awayTeamId

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <GlassCard strong className="w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400">예선 경기</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="닫기">✕</button>
        </div>
        <div className="mb-4 flex items-center justify-center gap-4">
          <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
            <FlagIcon iso2={home.iso2} className="h-8 w-12" />
            <span className="text-sm font-semibold text-white">{home.nameKo}</span>
            <span className="text-[10px] text-gray-500">FIFA {home.fifaRankApprox}위</span>
          </div>
          <div className="rounded-lg bg-white/10 px-3 py-1.5 text-2xl font-bold text-white">
            {match.homeGoals} - {match.awayGoals}
          </div>
          <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
            <FlagIcon iso2={away.iso2} className="h-8 w-12" />
            <span className="text-sm font-semibold text-white">{away.nameKo}</span>
            <span className="text-[10px] text-gray-500">FIFA {away.fifaRankApprox}위</span>
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-3">
          <p className="mb-2 text-center text-[11px] font-bold text-gray-400">전력 비교</p>
          <div className="space-y-1.5">
            <RatingRow label="공격" home={hr.attack} away={ar.attack} />
            <RatingRow label="수비" home={hr.defense} away={ar.defense} />
            <RatingRow label="컨디션" home={hr.form} away={ar.form} />
            <RatingRow label="종합" home={hr.overall} away={ar.overall} />
          </div>
          {favored && (
            <p className="mt-2 text-center text-[10px] text-gray-500">
              {ALL_NATIONS_BY_ID[favored].nameKo} 쪽이 전력상 우세했습니다.
            </p>
          )}
        </div>
      </GlassCard>
    </div>
  )
}
