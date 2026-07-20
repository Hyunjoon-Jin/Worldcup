import { useMemo } from 'react'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useContinentalStore } from '../../store/useContinentalStore'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useCareerStore } from '../../store/useCareerStore'
import { useMatchDetailStore, type MatchDetailRef } from '../../store/useMatchDetailStore'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { buildCupPhases } from '../../engine/season/seasonTimeline'
import { qualWindowDate } from '../../engine/qualification/calendar'
import { deriveQualStages, stageNameOfGroup } from '../../engine/qualification/rules'
import { CUP_FORMATS, type CupId } from '../../data/continental/formats'
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
  const cupStage = useContinentalStore((s) => s.stage)
  const qualResult = useQualificationStore((s) => s.result)
  const qualRevealed = useQualificationStore((s) => s.revealed)
  const friendlies = useQualificationStore((s) => s.friendlies)
  const wcYear = useCareerStore((s) => s.year)

  const group = useMemo<GroupLetter | null>(() => {
    for (const g of GROUP_LETTERS) {
      if ((drawGroups[g] as (string | null)[]).includes(teamId)) return g
    }
    return null
  }, [drawGroups, teamId])

  return useMemo<MyFixture[]>(() => {
    const out: MyFixture[] = []

    // ── 지역예선: 내 팀 경기(치른 경기=스코어, 예정 경기=대진). 경기일(matchday)로 날짜를 부여한다. ──
    // 캘린더가 예선부터 시작하므로, 게임 초반 내내 내 팀 일정이 달력에 뜬다(F3).
    if (qualResult) {
      for (const [confed, r] of Object.entries(qualResult.byConfederation)) {
        const myMatches = r.matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
        if (myMatches.length === 0) continue
        const revealedMd = qualRevealed[confed] ?? 0
        // 예선은 대륙마다 1·2·3차 예선 단계로 나뉜다. 전역 경기일(11차 등)이 아니라 '단계 + 단계 내 경기 번호'로
        // 표기한다(예: 2차 예선 6경기). 각 단계의 시작 경기일(startMd)로 단계 내 경기 번호를 구한다.
        const stageStart = new Map(deriveQualStages(r).map((s) => [s.name, s.startMd]))
        for (const m of myMatches) {
          const isHome = m.homeTeamId === teamId
          const oppId = isHome ? m.awayTeamId : m.homeTeamId
          const date = qualWindowDate(m.matchday - 1, wcYear)
          const played = revealedMd >= m.matchday
          const stageName = stageNameOfGroup(r, m.group)
          const matchInStage = m.matchday - (stageStart.get(stageName) ?? m.matchday) + 1
          const roundLabel = `${stageName} ${matchInStage}경기`
          if (played) {
            const gf = isHome ? m.homeGoals : m.awayGoals
            const ga = isHome ? m.awayGoals : m.homeGoals
            const mdGroup = (Math.min(Math.max(m.matchday, 1), 3) || 1) as 1 | 2 | 3
            const ref: MatchDetailRef = { kind: 'group', external: true, competition: 'wcQual', match: { group: 'A', matchday: mdGroup, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals } }
            out.push({ key: `q-${confed}-${m.matchday}-${m.group}-${oppId}`, comp: 'wc', date, roundLabel, opponentId: oppId, score: `${gf}-${ga}`, result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', onClick: () => selectMatch(ref) })
          } else {
            out.push({ key: `q-up-${confed}-${m.matchday}-${m.group}-${oppId}`, comp: 'wc', date, roundLabel, opponentId: oppId, onClick: () => selectMatch({ kind: 'upcoming', homeTeamId: teamId, awayTeamId: oppId, label: roundLabel, date }) })
          }
        }
        break // 내 팀 소속 대륙을 찾았으면 종료
      }
    }

    // ── 친선전(평가전): 예선 경기일에 내 팀이 예선 경기가 없을 때 잡히는 평가전 ──
    // "지역예선 탈락 등으로 경기가 없을 땐 그냥 놀지 않고" 평가전을 치른다 — 캘린더/일정/상단바에 노출한다.
    if (qualResult && friendlies.length > 0) {
      const globalRevealed = Math.max(0, ...Object.values(qualRevealed))
      for (const f of friendlies) {
        if (f.homeTeamId !== teamId && f.awayTeamId !== teamId) continue
        const isHome = f.homeTeamId === teamId
        const oppId = isHome ? f.awayTeamId : f.homeTeamId
        const date = qualWindowDate(f.matchday - 1, wcYear)
        const played = f.matchday <= globalRevealed
        if (played) {
          const gf = isHome ? f.homeGoals : f.awayGoals
          const ga = isHome ? f.awayGoals : f.homeGoals
          const ref: MatchDetailRef = { kind: 'group', external: true, competition: 'friendly', match: { group: 'A', matchday: 1, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeGoals: f.homeGoals, awayGoals: f.awayGoals } }
          out.push({ key: `fr-${f.matchday}-${oppId}`, comp: 'wc', date, roundLabel: '친선경기', opponentId: oppId, score: `${gf}-${ga}`, result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', onClick: () => selectMatch(ref) })
        } else {
          out.push({ key: `fr-up-${f.matchday}-${oppId}`, comp: 'wc', date, roundLabel: '친선경기', opponentId: oppId, onClick: () => selectMatch({ kind: 'upcoming', homeTeamId: teamId, awayTeamId: oppId, label: '친선경기', date }) })
        }
      }
    }

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

    // ── 대륙컵(활성 대회): 내 팀 대진 — 공개된 단계(stage)까지는 결과, 이후는 예정으로 표시(클릭 시 대회 페이지) ──
    if (cupActiveId && cupResult) {
      const myGroup = cupResult.groups.find((g) => g.teams.includes(teamId))
      if (myGroup) {
        const phases = buildCupPhases(cupActiveId, cupYear ?? 0)
        const year = cupYear ?? 0
        const goCup = () => onSelectCup(cupActiveId, year)
        // 단계별 공개(ContinentalStage와 동형): stage 1~3=조별 MD, 4~=녹아웃 라운드.
        const revealedGroupMd = Math.min(cupStage, 3)
        const revealedKoRounds = Math.max(0, cupStage - 3)
        const koOrder = CUP_FORMATS[cupActiveId].knockout
        const isKoRoundRevealed = (round: string) => {
          if (round === 'THIRD') return revealedKoRounds >= koOrder.length // 3·4위전은 결승과 함께 마지막에 공개
          const idx = koOrder.indexOf(round as (typeof koOrder)[number])
          return idx >= 0 && idx < revealedKoRounds
        }
        for (const m of myGroup.matches.filter((x) => x.homeTeamId === teamId || x.awayTeamId === teamId)) {
          const oppId = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId
          const ph = phases.find((p) => p.key === `G${m.matchday}`)
          const roundLabel = `조별리그 ${m.matchday}차전`
          if (m.matchday <= revealedGroupMd) {
            const isHome = m.homeTeamId === teamId
            const gf = isHome ? m.homeGoals : m.awayGoals
            const ga = isHome ? m.awayGoals : m.homeGoals
            out.push({ key: `cg-${m.matchday}`, comp: 'cup', date: ph?.start, roundLabel, opponentId: oppId, score: `${gf}-${ga}`, result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', onClick: goCup })
          } else {
            out.push({ key: `cg-${m.matchday}`, comp: 'cup', date: ph?.start, roundLabel, opponentId: oppId, onClick: goCup })
          }
        }
        for (const m of cupResult.knockout.filter((x) => x.homeTeamId === teamId || x.awayTeamId === teamId)) {
          const oppId = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId
          const ph = phases.find((p) => p.key === m.round)
          const roundLabel = ROUND_LABEL[m.round]
          if (isKoRoundRevealed(m.round)) {
            const isHome = m.homeTeamId === teamId
            const gf = isHome ? m.result.homeGoals : m.result.awayGoals
            const ga = isHome ? m.result.awayGoals : m.result.homeGoals
            const won = m.result.winnerTeamId === teamId
            out.push({ key: `ck-${m.slotId}`, comp: 'cup', date: ph?.start, roundLabel, opponentId: oppId, score: `${gf}-${ga}`, result: won ? 'W' : 'L', onClick: goCup })
          } else {
            out.push({ key: `ck-${m.slotId}`, comp: 'cup', date: ph?.start, roundLabel, opponentId: oppId, onClick: goCup })
          }
        }
      }
    }

    return out.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  }, [group, groupMatches, knockoutSlots, schedule, drawGroups, teamId, selectMatch, cupActiveId, cupResult, cupStage, cupYear, onSelectCup, qualResult, qualRevealed, friendlies, wcYear])
}
