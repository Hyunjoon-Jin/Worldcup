import { TEAMS_BY_ID } from '../../data/teams'
import { formatKoreanDate } from '../../data/calendar'
import { getRatings, classifyMatchUpset } from '../../engine/matchEngine'
import { useMatchDetailStore } from '../../store/useMatchDetailStore'
import { useSelectionStore } from '../../store/useSelectionStore'
import { FlagIcon } from './FlagIcon'
import { GlassCard } from './GlassCard'
import { UpsetBadge } from './UpsetBadge'

const ROUND_LABEL_KO: Record<string, string> = {
  R32: '32강',
  R16: '16강',
  QF: '8강',
  SF: '4강',
  THIRD: '3·4위전',
  FINAL: '결승',
}

function RatingRow({ label, homeValue, awayValue }: { label: string; homeValue: number; awayValue: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-10 text-right font-bold ${homeValue > awayValue ? 'text-emerald-300' : 'text-gray-300'}`}>
        {homeValue}
      </span>
      <div className="flex-1 text-center text-gray-500">{label}</div>
      <span className={`w-10 text-left font-bold ${awayValue > homeValue ? 'text-emerald-300' : 'text-gray-300'}`}>
        {awayValue}
      </span>
    </div>
  )
}

export function MatchDetailModal() {
  const selected = useMatchDetailStore((s) => s.selected)
  const clearMatch = useMatchDetailStore((s) => s.clearMatch)
  const selectTeam = useSelectionStore((s) => s.selectTeam)

  if (!selected) return null

  const homeTeamId = selected.kind === 'upcoming' ? selected.homeTeamId : selected.match.homeTeamId
  const awayTeamId = selected.kind === 'upcoming' ? selected.awayTeamId : selected.match.awayTeamId
  const homeTeam = TEAMS_BY_ID[homeTeamId]
  const awayTeam = TEAMS_BY_ID[awayTeamId]
  const homeRatings = getRatings(homeTeamId)
  const awayRatings = getRatings(awayTeamId)

  const played = selected.kind !== 'upcoming'
  const homeGoals = selected.kind !== 'upcoming' ? selected.match.homeGoals : undefined
  const awayGoals = selected.kind !== 'upcoming' ? selected.match.awayGoals : undefined
  const upsetInfo = played ? classifyMatchUpset(homeTeamId, awayTeamId, homeGoals!, awayGoals!) : null
  const wentToPenalties = selected.kind === 'knockout' ? selected.match.wentToPenalties : false
  const winnerTeamId = selected.kind === 'knockout' ? selected.match.winnerTeamId : upsetInfo?.winnerTeamId

  const label =
    selected.kind === 'group'
      ? `조별리그 MD${selected.match.matchday} · 조 ${selected.match.group}`
      : selected.kind === 'knockout'
        ? ROUND_LABEL_KO[selected.match.round]
        : selected.label

  const favoredTeamId =
    homeRatings.overall === awayRatings.overall
      ? null
      : homeRatings.overall > awayRatings.overall
        ? homeTeamId
        : awayTeamId

  const goToTeam = (teamId: string) => {
    clearMatch()
    selectTeam(teamId)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={clearMatch}
    >
      <GlassCard strong className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400">{label}</span>
          <button type="button" onClick={clearMatch} className="text-gray-400 hover:text-white" aria-label="닫기">
            ✕
          </button>
        </div>

        {selected.date && (
          <p className="mb-3 text-center text-[11px] text-gray-500">
            {formatKoreanDate(selected.date)}
            {selected.timeSlot ? ` ${selected.timeSlot}` : ''} 현지시간
          </p>
        )}

        <div className="mb-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => goToTeam(homeTeamId)}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center hover:opacity-80"
          >
            <FlagIcon iso2={homeTeam.iso2} className="h-8 w-12" />
            <span className="text-sm font-semibold text-white">{homeTeam.nameKo}</span>
            <span className="text-[10px] text-gray-500">FIFA {homeTeam.fifaRankApprox}위</span>
          </button>
          <div className="shrink-0 text-center">
            {played ? (
              <div className="rounded-lg bg-white/10 px-3 py-1.5 text-2xl font-bold text-white">
                {homeGoals} - {awayGoals}
              </div>
            ) : (
              <div className="text-lg font-bold text-gray-500">VS</div>
            )}
            {wentToPenalties && <div className="mt-1 text-[10px] text-gray-400">승부차기</div>}
          </div>
          <button
            type="button"
            onClick={() => goToTeam(awayTeamId)}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center hover:opacity-80"
          >
            <FlagIcon iso2={awayTeam.iso2} className="h-8 w-12" />
            <span className="text-sm font-semibold text-white">{awayTeam.nameKo}</span>
            <span className="text-[10px] text-gray-500">FIFA {awayTeam.fifaRankApprox}위</span>
          </button>
        </div>

        {!played && <p className="mb-4 text-center text-xs text-gray-400">아직 진행되지 않은 경기입니다.</p>}

        {played && upsetInfo && (upsetInfo.upset || upsetInfo.surpriseDraw) && (
          <div className="mb-4 flex justify-center">
            <UpsetBadge upset={upsetInfo.upset} surpriseDraw={upsetInfo.surpriseDraw} />
          </div>
        )}

        {played && winnerTeamId && (
          <p className="mb-4 text-center text-xs text-emerald-300">
            {TEAMS_BY_ID[winnerTeamId].nameKo} 승리{wentToPenalties ? ' (승부차기)' : ''}
          </p>
        )}

        <div className="rounded-lg bg-white/5 p-3">
          <p className="mb-2 text-center text-[11px] font-bold text-gray-400">
            {played ? '경기 전 전력 비교' : '전력 비교'}
          </p>
          <div className="space-y-1.5">
            <RatingRow label="공격" homeValue={homeRatings.attack} awayValue={awayRatings.attack} />
            <RatingRow label="수비" homeValue={homeRatings.defense} awayValue={awayRatings.defense} />
            <RatingRow label="컨디션" homeValue={homeRatings.form} awayValue={awayRatings.form} />
            <RatingRow label="종합" homeValue={homeRatings.overall} awayValue={awayRatings.overall} />
          </div>
          {favoredTeamId && (
            <p className="mt-2 text-center text-[10px] text-gray-500">
              {TEAMS_BY_ID[favoredTeamId].nameKo} 쪽이 전력상 {played ? '우세했습니다.' : '우세합니다.'}
            </p>
          )}
        </div>
      </GlassCard>
    </div>
  )
}
