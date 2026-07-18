import { useMemo } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { UpsetBadge } from '../common/UpsetBadge'
import { isUpset } from '../../engine/matchEngine'
import { useMatchDetailStore } from '../../store/useMatchDetailStore'
import type { CupFormat } from '../../data/continental/formats'
import type { CupKnockoutMatch } from '../../engine/continental/runCup'
import type { KnockoutMatch, KnockoutRound } from '../../types/match'

const ROUND_LABEL: Record<KnockoutRound, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위전', FINAL: '결승' }

/** CupKnockoutMatch → 경기 상세 모달이 받는 KnockoutMatch(대륙컵이므로 external). */
function toKnockoutMatch(m: CupKnockoutMatch): KnockoutMatch {
  return {
    round: m.round,
    slotId: m.slotId,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeGoals: m.result.homeGoals,
    awayGoals: m.result.awayGoals,
    wentToPenalties: m.result.wentToPenalties,
    winnerTeamId: m.result.winnerTeamId,
    homePenalties: m.result.homePenalties,
    awayPenalties: m.result.awayPenalties,
  }
}

/** 월드컵 MatchNode와 동일한 시각·상호작용의 대륙컵 녹아웃 노드(클릭 시 경기 상세). */
function CupMatchNode({ m }: { m: CupKnockoutMatch }) {
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)
  const r = m.result
  const homeWon = r.winnerTeamId === m.homeTeamId
  const loserId = homeWon ? m.awayTeamId : m.homeTeamId
  const upset = isUpset(r.winnerTeamId, loserId)
  const pk = r.wentToPenalties ? ` (PK ${r.homePenalties}-${r.awayPenalties})` : ''
  return (
    <div
      onClick={() => selectMatch({ kind: 'knockout', match: toKnockoutMatch(m), external: true })}
      className={`glass w-44 shrink-0 cursor-pointer rounded-xl py-1 text-xs transition-colors hover:bg-white/10 sm:w-52 ${upset ? 'ring-1 ring-red-400/40' : ''}`}
    >
      <div className={`flex items-center justify-between gap-2 px-2 py-1 ${homeWon ? 'font-bold text-white' : 'text-gray-300'}`}>
        <span className="flex min-w-0 items-center gap-1.5"><TeamLink teamId={m.homeTeamId} /></span>
        <span className="shrink-0 tabular-nums">{r.homeGoals}</span>
      </div>
      <div className="mx-2 h-px bg-white/10" />
      <div className={`flex items-center justify-between gap-2 px-2 py-1 ${!homeWon ? 'font-bold text-white' : 'text-gray-300'}`}>
        <span className="flex min-w-0 items-center gap-1.5"><TeamLink teamId={m.awayTeamId} /></span>
        <span className="shrink-0 tabular-nums">{r.awayGoals}</span>
      </div>
      {(r.wentToPenalties || upset) && (
        <div className="flex items-center justify-center gap-1 pb-0.5 text-center text-[9px] text-gray-500">
          {r.wentToPenalties && <span>승부차기{pk}</span>}
          {upset && <UpsetBadge upset className="text-[9px]" />}
        </div>
      )}
    </div>
  )
}

/**
 * 대륙컵 녹아웃을 월드컵 BracketView와 동일한 열(라운드) 구조로 렌더한다. 공개된 라운드만 표시하고,
 * 각 노드는 클릭 시 경기 상세(external)로 연결된다. 포맷별로 라운드 구성이 달라도(32강~결승) 자동 대응.
 */
export function CupBracketView({ knockout, format, revealedRounds }: { knockout: CupKnockoutMatch[]; format: CupFormat; revealedRounds: number }) {
  const columns = useMemo(() => {
    // 메인 라운드(3·4위전 제외)를 순서대로, 공개된 만큼만.
    const mainRounds = format.knockout.filter((r) => r !== 'THIRD')
    const shown = mainRounds.slice(0, revealedRounds)
    const cols = shown.map((round) => ({
      title: ROUND_LABEL[round],
      matches: knockout.filter((m) => m.round === round),
    }))
    // 3·4위전은 전체 라운드가 공개됐을 때 결승 열에 함께 보인다.
    if (format.thirdPlace && revealedRounds >= mainRounds.length) {
      const third = knockout.filter((m) => m.round === 'THIRD')
      if (third.length && cols.length) cols[cols.length - 1] = { title: `${cols[cols.length - 1].title} · 3·4위전`, matches: [...cols[cols.length - 1].matches, ...third] }
    }
    return cols.filter((c) => c.matches.length > 0)
  }, [knockout, format, revealedRounds])

  if (columns.length === 0) {
    return <GlassCard className="p-8 text-center text-[11px] text-gray-500">아직 녹아웃 라운드가 시작되지 않았습니다. ‘진행·일정’에서 조별리그를 마치면 대진표가 표시됩니다.</GlassCard>
  }

  return (
    <div>
      <p className="mb-2 text-center text-[11px] text-gray-500 sm:hidden">← 옆으로 스크롤하여 전체 대진표를 확인하세요 →</p>
      <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.title} className="flex shrink-0 flex-col gap-3">
            <h3 className="font-display text-center text-sm font-semibold tracking-wide text-emerald-300/90">{col.title}</h3>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {col.matches.map((m) => (
                <CupMatchNode key={m.slotId} m={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
