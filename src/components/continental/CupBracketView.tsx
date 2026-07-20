import { useMemo } from 'react'
import { TeamLink } from '../common/TeamLink'
import { UpsetBadge } from '../common/UpsetBadge'
import { isUpset } from '../../engine/matchEngine'
import { useMatchDetailStore } from '../../store/useMatchDetailStore'
import { rankGroupTeams, computeStandings } from '../../engine/tiebreakers'
import { computeExactRankLocks } from '../../engine/qualificationStatus'
import { firstRoundPairings, type CupResult, type CupGroupResult } from '../../engine/continental/runCup'
import { toGroupMatches, letterOf } from '../../engine/continental/cupGroupHelpers'
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

/** 팀 미확정(빈 슬롯) 한 줄. */
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

/** 팀은 정해졌지만 아직 경기 결과가 없는(또는 잠정 대진) 한 줄 — 확정이면 ✓ 표시(월드컵 MatchNode와 동형). */
function PendingRow({ teamId, confirmed, provisional }: { teamId: string | null; confirmed: boolean; provisional: boolean }) {
  if (!teamId) return <TbdRow />
  return (
    <div className={`flex items-center justify-between gap-2 px-2 py-1 ${confirmed ? 'text-gray-200' : 'text-gray-400'}`}>
      <span className="flex min-w-0 items-center gap-1.5"><TeamLink teamId={teamId} /></span>
      {provisional && (
        <span className={`shrink-0 text-[9px] ${confirmed ? 'text-emerald-300' : 'text-gray-500'}`}>{confirmed ? '확정' : '잠정'}</span>
      )}
    </div>
  )
}

/** 팀은 정해졌으나 결과 대기 중인(또는 잠정) 대진 노드. */
function CupPendingNode({ home, away, homeConfirmed, awayConfirmed, provisional }: { home: string | null; away: string | null; homeConfirmed: boolean; awayConfirmed: boolean; provisional: boolean }) {
  return (
    <div className="glass w-44 shrink-0 rounded-xl py-1 text-xs sm:w-52">
      <PendingRow teamId={home} confirmed={homeConfirmed} provisional={provisional} />
      <div className="mx-2 h-px bg-white/10" />
      <PendingRow teamId={away} confirmed={awayConfirmed} provisional={provisional} />
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
      onClick={() => selectMatch({ kind: 'knockout', match: toKnockoutMatch(m), external: true, competition: 'cup' })}
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

/** 조별리그 현재 순위로 잠정 조 결과를 만든다(공개된 경기일까지). 월드컵 provisionalSlots와 동형. */
function provisionalGroups(result: CupResult, format: CupFormat, revealedGroupMd: number): CupGroupResult[] {
  return result.groups.map((g) => {
    const matches = g.matches.filter((m) => m.matchday <= revealedGroupMd)
    return { ...g, matches, ranking: rankGroupTeams(g.teams, matches, format.groupTiebreak), standings: computeStandings(g.teams, matches) }
  })
}

/**
 * 대륙컵 녹아웃을 월드컵 BracketView와 **완전히 동일한** 방식으로 렌더한다:
 * - 전체 라운드(16강~결승)를 항상 열로 펼쳐 대진 트리를 보여준다.
 * - 조별리그 중에는 현재 순위 기준 '잠정 대진'을 첫 라운드에 채운다(확정 표시 포함, 스포일러 없이 예상 대진 미리보기).
 * - 녹아웃 중에는 다음 라운드의 대진(진출 확정 팀)을 결과 없이 미리 보여주고, 공개된 라운드만 실제 결과를 표시한다.
 */
export function CupBracketView({
  knockout,
  format,
  revealedRounds,
  result,
  revealedGroupMd,
}: {
  knockout: CupKnockoutMatch[]
  format: CupFormat
  revealedRounds: number
  result: CupResult
  revealedGroupMd: number
}) {
  const mainRounds = useMemo(() => format.knockout.filter((r) => r !== 'THIRD'), [format])
  const isPreKnockout = revealedRounds === 0

  // 조별리그 중 첫 라운드 잠정 대진 + 확정(순위 고정) 팀 집합.
  const provisional = useMemo(() => {
    if (!isPreKnockout) return null
    const pg = provisionalGroups(result, format, revealedGroupMd)
    const pairs = firstRoundPairings(format, pg)
    const locked = new Set<string>()
    for (const g of result.groups) {
      const gm = toGroupMatches(result.groups, revealedGroupMd).filter((m) => m.group === letterOf(g.groupIndex))
      const rankLocks = computeExactRankLocks(g.teams, gm)
      const order = rankGroupTeams(g.teams, gm, format.groupTiebreak)
      order.forEach((id, i) => {
        if (i < format.advancePerGroup && rankLocks[i]) locked.add(id) // 진출 순위가 고정된 팀
      })
    }
    return { pairs, locked }
  }, [isPreKnockout, result, format, revealedGroupMd])

  const columns = useMemo(() => {
    return mainRounds.map((round, i) => {
      const roundMatches = knockout.filter((m) => m.round === round)
      const revealed = i < revealedRounds
      const isNextRound = i === revealedRounds // 다음에 치를 라운드(대진은 알지만 결과는 대기)
      const slotCount = roundMatches.length || Math.max(1, format.teams / Math.pow(2, i + 2))
      let title = ROUND_LABEL[round]
      const third = format.thirdPlace && round === mainRounds[mainRounds.length - 1] ? knockout.filter((m) => m.round === 'THIRD') : []
      if (third.length) title = `${title} · 3·4위전`
      return { title, roundMatches, revealed, isNextRound, slotCount, third, key: round, roundIndex: i }
    })
  }, [knockout, mainRounds, revealedRounds, format])

  return (
    <div>
      {isPreKnockout && provisional && (
        <p className="mb-3 text-center text-xs font-semibold text-amber-300">
          ⚠ 잠정 대진 — 조별리그가 지금 끝난다면의 예상이며, ‘확정’ 표시가 없는 팀은 남은 경기 결과에 따라 계속 바뀔 수 있습니다.
        </p>
      )}
      <p className="mb-2 text-center text-[11px] text-gray-500 sm:hidden">← 옆으로 스크롤하여 전체 대진표를 확인하세요 →</p>
      <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.key} className="flex shrink-0 flex-col gap-3">
            <h3 className="font-display text-center text-sm font-semibold tracking-wide text-emerald-300/90">{col.title}</h3>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {col.revealed ? (
                // 공개된 라운드 — 실제 결과.
                col.roundMatches.map((m) => <CupMatchNode key={m.slotId} m={m} />)
              ) : col.roundIndex === 0 && isPreKnockout && provisional ? (
                // 조별리그 중 첫 라운드 — 현재 순위 기준 잠정 대진.
                provisional.pairs.map((p, i) => (
                  <CupPendingNode key={i} home={p.home} away={p.away} homeConfirmed={provisional.locked.has(p.home)} awayConfirmed={provisional.locked.has(p.away)} provisional />
                ))
              ) : col.isNextRound && !isPreKnockout ? (
                // 녹아웃 중 다음 라운드 — 진출 확정 팀의 대진(결과 대기).
                col.roundMatches.map((m) => (
                  <CupPendingNode key={m.slotId} home={m.homeTeamId} away={m.awayTeamId} homeConfirmed awayConfirmed provisional={false} />
                ))
              ) : (
                // 그 외 미래 라운드 — 대진 미정.
                Array.from({ length: col.slotCount }, (_, i) => <CupTbdNode key={i} />)
              )}
              {/* 3·4위전은 결승과 함께, 해당 라운드가 공개됐을 때만 실제 결과로 표시. */}
              {col.revealed && col.third.map((m) => <CupMatchNode key={m.slotId} m={m} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
