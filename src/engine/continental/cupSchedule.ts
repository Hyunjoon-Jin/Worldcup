import { TIME_SLOTS } from '../scheduleEngine'
import { buildCupPhases } from '../season/seasonTimeline'
import { BASE_FINALS_YEAR } from '../../data/calendar'
import type { CupFormat, CupId } from '../../data/continental/formats'
import type { CupKnockoutMatch, CupMatch, CupResult } from './runCup'
import type { KnockoutRound } from '../../types/match'

const ROUND_LABEL: Record<KnockoutRound, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위전', FINAL: '결승' }

/** 하루 안의 한 시간대(킥오프)에 열리는 경기 묶음. */
export interface CupSlotBatch {
  timeSlot: string
  group: CupMatch[]
  ko: CupKnockoutMatch[]
}

/** 대륙컵 하루(=한 단계: 조별 매치데이 또는 녹아웃 라운드)의 일정. */
export interface CupScheduleDay {
  /** 0-based. 이 날이 모두 끝나면 store stage = stageIndex+1. */
  stageIndex: number
  kind: 'group' | 'knockout'
  matchday?: number
  round?: KnockoutRound
  /** 조별 단계에서의 Day 번호(1..3). 녹아웃이면 undefined. */
  groupDay?: number
  /** 상태/타임라인 라벨 — 조별은 'Day N', 녹아웃은 라운드명. */
  label: string
  date: string
  /** 시간대별 경기 묶음(월드컵처럼 12:00~21:00 분산). */
  slots: CupSlotBatch[]
}

function batchByTimeSlot(group: CupMatch[], ko: CupKnockoutMatch[]): CupSlotBatch[] {
  const items = [...group.map((m) => ({ g: m as CupMatch | undefined, k: undefined as CupKnockoutMatch | undefined })), ...ko.map((m) => ({ g: undefined as CupMatch | undefined, k: m as CupKnockoutMatch | undefined }))]
  const bySlot = new Map<string, CupSlotBatch>()
  items.forEach((it, i) => {
    const ts = TIME_SLOTS[i % TIME_SLOTS.length]
    const b = bySlot.get(ts) ?? { timeSlot: ts, group: [], ko: [] }
    if (it.g) b.group.push(it.g)
    if (it.k) b.ko.push(it.k)
    bySlot.set(ts, b)
  })
  return TIME_SLOTS.filter((ts) => bySlot.has(ts)).map((ts) => bySlot.get(ts)!)
}

/**
 * 대륙컵 본선을 월드컵과 동일한 '일·시간대' 구조로 편성한다. 조별 3매치데이(=Day 1~3)와 각 녹아웃
 * 라운드를 하루로 보고, 하루 안의 경기를 12:00~21:00 시간대에 분산한다. 3·4위전은 결승과 같은 날.
 * days[i]는 store stage i+1에 대응(days.length = cupTotalStages).
 */
export function cupScheduleDays(result: CupResult, format: CupFormat, cupId: CupId, year: number = BASE_FINALS_YEAR): CupScheduleDay[] {
  const phases = buildCupPhases(cupId, year)
  const dateOf = (key: string) => phases.find((p) => p.key === key)?.start ?? ''
  const days: CupScheduleDay[] = []
  for (let md = 1; md <= 3; md++) {
    const gm = result.groups.flatMap((g) => g.matches.filter((m) => m.matchday === md))
    days.push({ stageIndex: md - 1, kind: 'group', matchday: md, groupDay: md, label: `Day ${md}`, date: dateOf(`G${md}`), slots: batchByTimeSlot(gm, []) })
  }
  const mainRounds = format.knockout
  mainRounds.forEach((round, i) => {
    const ko = result.knockout.filter((m) => m.round === round)
    const withThird = i === mainRounds.length - 1 && format.thirdPlace ? [...ko, ...result.knockout.filter((m) => m.round === 'THIRD')] : ko
    days.push({ stageIndex: 3 + i, kind: 'knockout', round, label: ROUND_LABEL[round], date: dateOf(round), slots: batchByTimeSlot([], withThird) })
  })
  return days
}
