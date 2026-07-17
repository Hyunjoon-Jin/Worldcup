import { useMemo } from 'react'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useContinentalStore } from '../../store/useContinentalStore'
import { useMatchDetailStore, type MatchDetailRef } from '../../store/useMatchDetailStore'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { buildCupPhases } from '../../engine/season/seasonTimeline'
import type { CupId } from '../../data/continental/formats'
import type { GroupLetter } from '../../types/group'
import type { KnockoutRound } from '../../types/match'

const ROUND_LABEL: Record<KnockoutRound, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위전', FINAL: '결승' }

/** 내 팀의 한 경기(월드컵 본선=모달, 대륙컵=대회 페이지). 캘린더/일정 표시 공용. */
export interface MyFixture {
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
 * 내 팀이 치른/치를 경기를 날짜와 함께 시간순으로 모은다(월드컵 본선 + 활성 대륙컵). 캘린더 그리드·
 * 내 팀 일정 카드에서 공용으로 쓴다. 월드컵 본선 경기는 클릭 시 경기 상세(모달), 대륙컵 경기는 대회 페이지로.
 */
export function useMyTeamFixtures(teamId: string, onSelectCup: (id: CupId, year: number) => void): MyFixture[] {
  const drawGroups = useDrawStore((s) => s.state.groups)
  const { schedule, groupMatches, knockoutSlots } = useProgressStore()
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)
  const cupActiveId = useContinentalStore((s) => s.activeCupId)
  const cupYear = useContinentalStore((s) => s.cupYear)
  const cupResult = useContinentalStore((s) => s.result)

  const group = useMemo<GroupLetter | null>(() => {
    for (const g of GROUP_LETTERS) {
      if ((drawGroups[g] as (string | null)[]).includes(teamId)) return g
    }
    return null
  }, [drawGroups, teamId])

  return useMemo<MyFixture[]>(() => {
    const out: MyFixture[] = []

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
      for (const fx of schedule?.groupMatches ?? []) {
        if (fx.group !== group || playedMd.has(fx.matchday)) continue
        const homeId = drawGroups[group][fx.homeSeed - 1]
        const awayId = drawGroups[group][fx.awaySeed - 1]
        if (homeId !== teamId && awayId !== teamId) continue
        const oppId = (homeId === teamId ? awayId : homeId) ?? null
        out.push({ key: `wg-up-${fx.id}`, comp: 'wc', date: fx.date, roundLabel: `조별리그 MD${fx.matchday}`, opponentId: oppId, onClick: () => oppId && selectMatch({ kind: 'upcoming', homeTeamId: teamId, awayTeamId: oppId, label: `조별리그 MD${fx.matchday}`, date: fx.date, timeSlot: fx.timeSlot }) })
      }
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

    // ── 대륙컵(활성 대회): 내 팀 대진 — 점수 없이 표시, 클릭 시 대회 페이지 ──
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

    return out.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  }, [group, groupMatches, knockoutSlots, schedule, drawGroups, teamId, selectMatch, cupActiveId, cupResult, cupYear, onSelectCup])
}
