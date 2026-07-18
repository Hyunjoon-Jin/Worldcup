import { useMemo } from 'react'
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

/** 아직 공개되지 않은(또는 팀 미확정) 녹아웃 슬롯 — 월드컵 MatchNode의 TBD 표시와 동일. */
function TbdRow() {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1 text-gray-300">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="h-3 w-4 shrink-0 rounded-[2px] bg-white/10" />
        <span className="truncate">TBD</span>
      </span>
    </div>
  )
}

function CupTbdNode() {
  return (
    <div className="glass w-44 shrink-0 rounded-xl py-1 text-xs sm:w-52">
      <TbdRow />
      <div className="mx-2 h-px bg-white/10" />
      <TbdRow />
    </div>
  )
}

/** 월드컵 MatchNode와 동일한 시각·상호작용의 대륙컵 녹아웃 노드(클릭 시 경기 상세). */
function CupMatchNode({ m }: { m: CupKnockoutMatch }) {
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)
  const r = m.result
  const homeWon = r.winnerTeamId === m.homeTeamId
  const loserId = homeWon ? m.awayTeamId : m.homeTeamId
  const upset = isUpset(r.winnerTeamId, loserId)
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
          {r.wentToPenalties && <span>승부차기</span>}
          {upset && <UpsetBadge upset className="text-[9px]" />}
        </div>
      )}
    </div>
  )
}

/**
 * 대륙컵 녹아웃을 월드컵 BracketView와 **완전히 동일한** 방식으로 렌더한다 — 전체 라운드(16강~결승)를
 * 항상 열로 펼쳐 대진 트리를 보여주고, 아직 공개되지 않은 라운드는 TBD 플레이스홀더로 채운다.
 * 공개된 라운드만 실제 팀/결과를 표시하고(스포일러 방지), 노드 클릭 시 경기 상세(external)로 연결된다.
 */
export function CupBracketView({ knockout, format, revealedRounds }: { knockout: CupKnockoutMatch[]; format: CupFormat; revealedRounds: number }) {
  const columns = useMemo(() => {
    // 메인 라운드(3·4위전 제외)를 순서대로 — 월드컵처럼 항상 전체를 열로 펼친다.
    const mainRounds = format.knockout.filter((r) => r !== 'THIRD')
    return mainRounds.map((round, i) => {
      const roundMatches = knockout.filter((m) => m.round === round)
      const revealed = i < revealedRounds
      // 공개 전 라운드는 매치 수만큼 TBD 노드를 채워 대진 트리 구조를 항상 보여준다.
      const slotCount = roundMatches.length || Math.max(1, format.teams / Math.pow(2, i + 2))
      let title = ROUND_LABEL[round]
      const third = format.thirdPlace && round === mainRounds[mainRounds.length - 1] ? knockout.filter((m) => m.round === 'THIRD') : []
      if (third.length) title = `${title} · 3·4위전`
      return { title, roundMatches, revealed, slotCount, third, key: round }
    })
  }, [knockout, format, revealedRounds])

  return (
    <div>
      <p className="mb-2 text-center text-[11px] text-gray-500 sm:hidden">← 옆으로 스크롤하여 전체 대진표를 확인하세요 →</p>
      <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.key} className="flex shrink-0 flex-col gap-3">
            <h3 className="font-display text-center text-sm font-semibold tracking-wide text-emerald-300/90">{col.title}</h3>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {col.revealed
                ? col.roundMatches.map((m) => <CupMatchNode key={m.slotId} m={m} />)
                : Array.from({ length: col.slotCount }, (_, i) => <CupTbdNode key={i} />)}
              {/* 3·4위전은 결승과 함께, 해당 라운드가 공개됐을 때만 실제 결과로 표시. */}
              {col.revealed && col.third.map((m) => <CupMatchNode key={m.slotId} m={m} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
