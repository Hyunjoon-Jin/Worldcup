import { TEAMS_BY_ID, getTeamsByPot } from '../data/teams'
import { GROUP_LETTERS, HOST_SLOTS } from '../data/hostSlots'
import { createSeededRandom, shuffleWith, type RandomFn } from './rng'
import type { GroupLetter } from '../types/group'
import type { Pot } from '../types/team'

export type GroupSlots = Record<GroupLetter, (string | null)[]>
export type PotPools = Record<Pot, string[]>

export interface DrawState {
  groups: GroupSlots
  pots: PotPools
}

export interface DrawLogEntry {
  teamId: string
  group: GroupLetter
  pot: Pot
}

function shuffle<T>(arr: T[], rand: RandomFn = Math.random): T[] {
  return shuffleWith(arr, rand)
}

export function createInitialDrawState(rand: RandomFn = Math.random): DrawState {
  const groups: GroupSlots = Object.fromEntries(GROUP_LETTERS.map((g) => [g, [null, null, null, null]])) as GroupSlots

  for (const [teamId, group] of Object.entries(HOST_SLOTS)) {
    groups[group][0] = teamId
  }

  const pots: PotPools = { 1: [], 2: [], 3: [], 4: [] }
  for (const pot of [1, 2, 3, 4] as Pot[]) {
    const teams = getTeamsByPot(pot)
      .filter((t) => !t.isHost)
      .map((t) => t.id)
    pots[pot] = shuffle(teams, rand)
  }
  return { groups, pots }
}

function confederationCounts(group: GroupLetter, groups: GroupSlots): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const teamId of groups[group]) {
    if (!teamId) continue
    const confed = TEAMS_BY_ID[teamId].confederation
    counts[confed] = (counts[confed] ?? 0) + 1
  }
  return counts
}

export function isValidPlacement(teamId: string, group: GroupLetter, groups: GroupSlots): boolean {
  const confed = TEAMS_BY_ID[teamId].confederation
  const counts = confederationCounts(group, groups)
  const current = counts[confed] ?? 0
  const max = confed === 'UEFA' ? 2 : 1
  return current < max
}

/** 포트 1→4 순서, 조 A→L 순서로 다음 빈 슬롯을 찾는다. */
export function findNextSlot(state: DrawState): { pot: Pot; group: GroupLetter } | null {
  for (const pot of [1, 2, 3, 4] as Pot[]) {
    if (state.pots[pot].length === 0) continue
    for (const group of GROUP_LETTERS) {
      if (state.groups[group][pot - 1] === null) {
        return { pot, group }
      }
    }
  }
  return null
}

function cloneState(state: DrawState): DrawState {
  return {
    groups: Object.fromEntries(Object.entries(state.groups).map(([g, arr]) => [g, [...arr]])) as GroupSlots,
    pots: { 1: [...state.pots[1]], 2: [...state.pots[2]], 3: [...state.pots[3]], 4: [...state.pots[4]] },
  }
}

/** 남은 팀/조로 끝까지 유효하게 완성 가능한지 백트래킹으로 검증한다(제자리 mutate 후 원복). */
function isCompletable(state: DrawState): boolean {
  const slot = findNextSlot(state)
  if (!slot) return true
  const { pot, group } = slot
  const pool = state.pots[pot]
  for (let i = 0; i < pool.length; i++) {
    const teamId = pool[i]
    if (!isValidPlacement(teamId, group, state.groups)) continue
    state.groups[group][pot - 1] = teamId
    pool.splice(i, 1)
    const ok = isCompletable(state)
    pool.splice(i, 0, teamId)
    state.groups[group][pot - 1] = null
    if (ok) return true
  }
  return false
}

export interface DrawNextResult {
  state: DrawState
  entry: DrawLogEntry
}

/**
 * 다음 팀을 무작위로 하나 뽑아 유효한 슬롯에 배정한다. 배정 후 남은 추첨이 끝까지
 * 완성 가능한 경우에만 확정하고, 그렇지 않으면(막다른 길) 다른 후보를 다시 뽑는다 —
 * 실제 드로우에서 조 배정 규정을 위반하면 재추첨하는 절차를 시뮬레이션한 것이다.
 */
export function drawNext(state: DrawState, rand: RandomFn = Math.random): DrawNextResult | null {
  const slot = findNextSlot(state)
  if (!slot) return null
  const { pot, group } = slot
  const candidates = shuffle(
    state.pots[pot].filter((teamId) => isValidPlacement(teamId, group, state.groups)),
    rand,
  )

  for (const teamId of candidates) {
    const probe = cloneState(state)
    const idx = probe.pots[pot].indexOf(teamId)
    probe.pots[pot].splice(idx, 1)
    probe.groups[group][pot - 1] = teamId
    if (isCompletable(probe)) {
      return { state: probe, entry: { teamId, group, pot } }
    }
  }

  // Fallback (이론상 도달하지 않음): 유효성 검사를 무시하고 아무 팀이나 배정
  const fallbackTeamId = state.pots[pot][0]
  const probe = cloneState(state)
  probe.pots[pot].splice(0, 1)
  probe.groups[group][pot - 1] = fallbackTeamId
  return { state: probe, entry: { teamId: fallbackTeamId, group, pot } }
}

export function isDrawComplete(state: DrawState): boolean {
  return findNextSlot(state) === null
}

export interface SeededDrawResult {
  state: DrawState
  log: DrawLogEntry[]
}

/**
 * 주어진 시드로 조추첨을 처음부터 끝까지 한 번에 결정론적으로 실행한다 (C6).
 * 같은 시드는 항상 같은 조 편성을 만들어, 흥미로운 조추첨을 저장·공유·재현할 수 있다.
 */
export function runSeededDraw(seed: string): SeededDrawResult {
  const rand = createSeededRandom(seed)
  let state = createInitialDrawState(rand)
  const log: DrawLogEntry[] = []
  let guard = 0
  while (!isDrawComplete(state) && guard < 100) {
    const result = drawNext(state, rand)
    if (!result) break
    state = result.state
    log.push(result.entry)
    guard++
  }
  return { state, log }
}
