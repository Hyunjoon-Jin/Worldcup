import { describe, expect, it } from 'vitest'
import { buildR32Matchups, type GroupResult } from '../src/engine/tournamentSimulation'
import { R32_SLOTS } from '../src/data/bracketTemplate'
import { GROUP_LETTERS } from '../src/data/hostSlots'
import type { GroupLetter } from '../src/types/group'

// 조 문자(팀ID 첫 글자)로 소속 조를 식별하는 합성 결과.
const groupOf = (id: string) => id[0]
const GROUP_RESULTS = Object.fromEntries(
  GROUP_LETTERS.map((g) => [g, { winner: `${g}1`, runnerup: `${g}2`, third: `${g}3`, fourth: `${g}4` }]),
) as Record<GroupLetter, GroupResult>

function* combos(arr: GroupLetter[], k: number, start = 0, acc: GroupLetter[] = []): Generator<GroupLetter[]> {
  if (acc.length === k) {
    yield acc
    return
  }
  for (let i = start; i < arr.length; i++) yield* combos(arr, k, i + 1, [...acc, arr[i]])
}

describe('본선 대진 — 3위팀 자기 조 조기 재대결 방지 (#11·#12)', () => {
  it('진출 8개 3위 조합 495가지 모두에서 R32·R16 자기 조 재대결이 없다', () => {
    let checked = 0
    for (const qual of combos(GROUP_LETTERS, 8)) {
      const matchups = buildR32Matchups(GROUP_RESULTS, qual)
      const bySlot = new Map(matchups.map((m) => [m.slotId, m]))

      // 배정된 3위팀이 실제로 8개(중복 없이)인지 확인.
      const thirds = matchups.flatMap((m) => [m.team1Id, m.team2Id]).filter((id) => id.endsWith('3'))
      expect(new Set(thirds).size).toBe(8)

      // R32: 한 경기 안에서 같은 조가 맞붙지 않는다.
      for (const m of matchups) expect(groupOf(m.team1Id)).not.toBe(groupOf(m.team2Id))

      // R16: R32_SLOTS를 인접 2개씩 묶은 두 슬롯에 같은 조가 동시에 있으면 R16 재대결 가능 → 금지.
      for (let i = 0; i < R32_SLOTS.length; i += 2) {
        const a = bySlot.get(R32_SLOTS[i].id)!
        const b = bySlot.get(R32_SLOTS[i + 1].id)!
        const groupsA = new Set([groupOf(a.team1Id), groupOf(a.team2Id)])
        for (const g of [groupOf(b.team1Id), groupOf(b.team2Id)]) {
          expect(groupsA.has(g)).toBe(false)
        }
      }
      checked++
    }
    expect(checked).toBe(495)
  })

  it('배정은 결정적이다 — 같은 입력은 같은 대진을 낸다', () => {
    const qual: GroupLetter[] = ['A', 'C', 'D', 'F', 'G', 'I', 'J', 'L']
    const first = buildR32Matchups(GROUP_RESULTS, qual)
    const second = buildR32Matchups(GROUP_RESULTS, qual)
    expect(second).toEqual(first)
  })
})
