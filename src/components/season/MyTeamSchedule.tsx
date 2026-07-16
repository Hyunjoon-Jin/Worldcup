import { useMemo } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useContinentalStore } from '../../store/useContinentalStore'
import { useContinentalHistoryStore } from '../../store/useContinentalHistoryStore'
import { useCareerStore } from '../../store/useCareerStore'
import { useMatchDetailStore, type MatchDetailRef } from '../../store/useMatchDetailStore'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { formatKoreanDate } from '../../data/calendar'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { buildCupPhases, buildSeasonTimeline } from '../../engine/season/seasonTimeline'
import type { CupId } from '../../data/continental/formats'
import type { GroupLetter } from '../../types/group'
import type { KnockoutRound } from '../../types/match'
import type { Confederation } from '../../types/team'

function fmtYmd(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}.${Number(m)}.${Number(d)}`
}

const ROUND_LABEL: Record<KnockoutRound, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위전', FINAL: '결승' }

/** 내 팀 일정의 한 경기(월드컵 본선=모달, 대륙컵=대회 페이지로 이동). */
interface Fixture {
  key: string
  comp: 'wc' | 'cup'
  date?: string
  roundLabel: string
  opponentId: string | null
  score?: string
  result?: 'W' | 'D' | 'L'
  onClick: () => void
}

/**
 * 캘린더 탭의 '내 팀 경기 일정'. 내 팀이 설정돼 있을 때, 내 팀이 치른/치를 경기를 날짜와 함께 시간순으로
 * 보여준다. 월드컵 본선 경기는 클릭 시 경기 상세(모달)를 열고, 대륙컵 경기는 해당 대회 실황 페이지로 이동한다.
 * (대륙컵 경기는 단계별 공개를 존중해 점수 없이 대진만 표시 — 실제 결과는 대회 페이지에서 확인.)
 */
export function MyTeamSchedule({ teamId, onSelectCup }: { teamId: string; onSelectCup: (id: CupId, year: number) => void }) {
  const drawGroups = useDrawStore((s) => s.state.groups)
  const { schedule, groupMatches, knockoutSlots } = useProgressStore()
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)
  const cupActiveId = useContinentalStore((s) => s.activeCupId)
  const cupYear = useContinentalStore((s) => s.cupYear)
  const cupResult = useContinentalStore((s) => s.result)
  const wcYear = useCareerStore((s) => s.year)
  const progressPhase = useProgressStore((s) => s.phase)
  const cupEditions = useContinentalHistoryStore((s) => s.editions)

  // 내 팀이 이번 사이클에 참가하는 대회 일정(월드컵 + 소속 연맹 대륙컵) — 경기가 없어도 항상 표시.
  const myConfed = ALL_NATIONS_BY_ID[teamId]?.confederation
  const myTournaments = useMemo(() => {
    return buildSeasonTimeline(wcYear)
      .filter((e) => e.kind === 'wc' || (myConfed != null && (e.confeds === 'ALL' || (e.confeds as Confederation[]).includes(myConfed))))
      .map((e) => {
        const done = e.kind === 'wc' ? progressPhase === 'complete' : cupEditions.some((x) => x.cupId === e.id && x.year === e.year)
        return { e, done }
      })
  }, [wcYear, myConfed, progressPhase, cupEditions])

  // 월드컵 본선에서 내 팀의 조.
  const group = useMemo<GroupLetter | null>(() => {
    for (const g of GROUP_LETTERS) {
      if ((drawGroups[g] as (string | null)[]).includes(teamId)) return g
    }
    return null
  }, [drawGroups, teamId])

  const fixtures = useMemo<Fixture[]>(() => {
    const out: Fixture[] = []

    // ── 월드컵 본선: 치른 조별/녹아웃 경기 + 예정 경기 ──
    if (group) {
      const teamGroupMatches = groupMatches.filter((m) => m.group === group && (m.homeTeamId === teamId || m.awayTeamId === teamId))
      const playedMd = new Set(teamGroupMatches.map((m) => m.matchday))
      for (const m of teamGroupMatches) {
        const isHome = m.homeTeamId === teamId
        const gf = isHome ? m.homeGoals : m.awayGoals
        const ga = isHome ? m.awayGoals : m.homeGoals
        const oppId = isHome ? m.awayTeamId : m.homeTeamId
        const fx = schedule?.groupMatches.find((f) => f.group === m.group && f.matchday === m.matchday && drawGroups[m.group][f.homeSeed - 1] === m.homeTeamId)
        const ref: MatchDetailRef = { kind: 'group', match: m, date: fx?.date, timeSlot: fx?.timeSlot }
        out.push({ key: `wg-${m.group}-${m.matchday}`, comp: 'wc', date: fx?.date, roundLabel: `조별리그 MD${m.matchday}`, opponentId: oppId, score: `${gf}-${ga}`, result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', onClick: () => selectMatch(ref) })
      }
      // 예정 조별 경기
      for (const fx of schedule?.groupMatches ?? []) {
        if (fx.group !== group || playedMd.has(fx.matchday)) continue
        const homeId = drawGroups[group][fx.homeSeed - 1]
        const awayId = drawGroups[group][fx.awaySeed - 1]
        if (homeId !== teamId && awayId !== teamId) continue
        const oppId = (homeId === teamId ? awayId : homeId) ?? null
        out.push({ key: `wg-up-${fx.id}`, comp: 'wc', date: fx.date, roundLabel: `조별리그 MD${fx.matchday}`, opponentId: oppId, onClick: () => oppId && selectMatch({ kind: 'upcoming', homeTeamId: teamId, awayTeamId: oppId, label: `조별리그 MD${fx.matchday}`, date: fx.date, timeSlot: fx.timeSlot }) })
      }
      // 녹아웃(치른 경기 + 예정 슬롯)
      for (const slot of Object.values(knockoutSlots)) {
        const koFx = schedule?.knockoutMatches.find((f) => f.slotId === slot.slotId)
        if (slot.result) {
          const isHome = slot.result.homeTeamId === teamId
          const isAway = slot.result.awayTeamId === teamId
          if (!isHome && !isAway) continue
          const gf = isHome ? slot.result.homeGoals : slot.result.awayGoals
          const ga = isHome ? slot.result.awayGoals : slot.result.homeGoals
          const oppId = isHome ? slot.result.awayTeamId : slot.result.homeTeamId
          const won = slot.result.winnerTeamId === teamId
          out.push({ key: `wk-${slot.slotId}`, comp: 'wc', date: koFx?.date, roundLabel: ROUND_LABEL[slot.round], opponentId: oppId, score: `${gf}-${ga}`, result: won ? 'W' : 'L', onClick: () => selectMatch({ kind: 'knockout', match: slot.result!, date: koFx?.date, timeSlot: koFx?.timeSlot }) })
        } else {
          const isHome = slot.team1Id === teamId
          const isAway = slot.team2Id === teamId
          if (!isHome && !isAway) continue
          const oppId = isHome ? slot.team2Id : slot.team1Id
          out.push({ key: `wk-up-${slot.slotId}`, comp: 'wc', date: koFx?.date, roundLabel: ROUND_LABEL[slot.round], opponentId: oppId, onClick: () => oppId && selectMatch({ kind: 'upcoming', homeTeamId: teamId, awayTeamId: oppId, label: ROUND_LABEL[slot.round], date: koFx?.date, timeSlot: koFx?.timeSlot }) })
        }
      }
    }

    // ── 대륙컵(활성 대회): 내 팀 대진 — 단계별 공개를 존중해 점수 없이 표시, 클릭 시 대회 페이지 ──
    if (cupActiveId && cupResult) {
      const myGroup = cupResult.groups.find((g) => g.teams.includes(teamId))
      if (myGroup) {
        const phases = buildCupPhases(cupActiveId, cupYear ?? 0)
        const year = cupYear ?? 0
        const goCup = () => onSelectCup(cupActiveId, year)
        for (const m of myGroup.matches.filter((x) => x.homeTeamId === teamId || x.awayTeamId === teamId)) {
          const oppId = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId
          const ph = phases.find((p) => p.key === `G${m.matchday}`)
          out.push({ key: `cg-${m.matchday}`, comp: 'cup', date: ph?.start, roundLabel: `조별리그 ${m.matchday}차전`, opponentId: oppId, onClick: goCup })
        }
        for (const m of cupResult.knockout.filter((x) => x.homeTeamId === teamId || x.awayTeamId === teamId)) {
          const oppId = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId
          const ph = phases.find((p) => p.key === m.round)
          out.push({ key: `ck-${m.slotId}`, comp: 'cup', date: ph?.start, roundLabel: ROUND_LABEL[m.round], opponentId: oppId, onClick: goCup })
        }
      }
    }

    // 날짜순 정렬(날짜 없는 항목은 뒤로).
    return out.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  }, [group, groupMatches, knockoutSlots, schedule, drawGroups, teamId, selectMatch, cupActiveId, cupResult, cupYear, onSelectCup])

  return (
    <GlassCard className="p-4">
      <h3 className="mb-2 text-sm font-bold text-sky-300">⭐ 내 팀 <TeamLink teamId={teamId} /> 일정</h3>

      {/* 내 팀이 참가하는 대회 일정(경기 전에도 항상 표시) */}
      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-bold text-gray-400">참가 대회 ({wcYear} 시즌)</p>
        <div className="space-y-1">
          {myTournaments.map(({ e, done }) => (
            <div key={`${e.id}-${e.year}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">
              <span className="w-20 shrink-0 tabular-nums text-[10px] text-gray-400">{fmtYmd(e.start)}</span>
              <span className="min-w-0 flex-1 font-medium text-gray-200">{e.kind === 'wc' ? '🏆 ' : '🌍 '}{e.nameKo} <span className="text-gray-500">{e.year}</span></span>
              <span className={`shrink-0 text-[10px] font-bold ${done ? 'text-emerald-300' : 'text-gray-500'}`}>{done ? '✅ 완료' : '예정'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 내 팀 경기(대회 진행 시) */}
      <p className="mb-1.5 text-[11px] font-bold text-gray-400">경기 일정</p>
      {fixtures.length === 0 ? (
        <p className="text-[11px] text-gray-500">아직 치르거나 예정된 경기가 없습니다. 대회가 진행되면 내 팀의 경기가 여기에 표시됩니다. (경기를 누르면 상세가 열립니다)</p>
      ) : (
        <div className="space-y-1.5">
          {fixtures.map((f) => (
            <button
              key={f.key}
              onClick={f.onClick}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/15 ${f.comp === 'wc' ? 'bg-emerald-500/10' : 'bg-violet-500/10'}`}
            >
              <span className="w-16 shrink-0 tabular-nums text-[10px] text-gray-400">{f.date ? formatKoreanDate(f.date) : '미정'}</span>
              <span className="w-24 shrink-0 text-[10px] text-gray-400">{f.comp === 'wc' ? '🏆' : '🌍'} {f.roundLabel}</span>
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <span className="text-gray-500">vs</span>
                {f.opponentId ? <TeamLink teamId={f.opponentId} wrap className="min-w-0" /> : <span className="text-gray-500">TBD</span>}
              </span>
              {f.score ? (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${f.result === 'W' ? 'bg-emerald-500/20 text-emerald-300' : f.result === 'L' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-gray-300'}`}>{f.score}</span>
              ) : (
                <span className="shrink-0 text-[10px] text-gray-500">{f.comp === 'cup' ? '실황 ›' : '예정 ›'}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
