import { useMemo } from 'react'
import { GROUP_LETTERS } from '../../data/hostSlots'
import {
  FINAL_SLOT_ID,
  QF_SLOT_IDS,
  R16_SLOT_IDS,
  R32_SLOTS,
  R32_SLOT_IDS,
  SF_SLOT_IDS,
  THIRD_SLOT_ID,
} from '../../data/bracketTemplate'
import { GlassCard } from '../common/GlassCard'
import { MatchNode } from './MatchNode'
import {
  buildR32Matchups,
  computeGroupResults,
  computeQualifiedThirdGroups,
  type KnockoutSlotState,
} from '../../engine/tournamentSimulation'
import { computeExactRankLocks } from '../../engine/qualificationStatus'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import type { GroupLetter } from '../../types/group'

const COLUMNS: { title: string; slotIds: string[] }[] = [
  { title: '32강', slotIds: R32_SLOT_IDS },
  { title: '16강', slotIds: R16_SLOT_IDS },
  { title: '8강', slotIds: QF_SLOT_IDS },
  { title: '4강', slotIds: SF_SLOT_IDS },
  { title: '결승 · 3·4위전', slotIds: [FINAL_SLOT_ID, THIRD_SLOT_ID] },
]

function emptySlot(slotId: string): KnockoutSlotState {
  return { slotId, round: 'R32', team1Id: null, team2Id: null, result: null }
}

export function BracketView() {
  const drawGroups = useDrawStore((s) => s.state.groups)
  const groupMatches = useProgressStore((s) => s.groupMatches)
  const { knockoutSlots, phase } = useProgressStore()

  const isPreKnockout = phase === 'group' || phase === 'idle'

  const groupTeamsMap = useMemo(
    () =>
      Object.fromEntries(
        GROUP_LETTERS.map((g) => [g, (drawGroups[g] as (string | null)[]).filter(Boolean) as string[]]),
      ) as Record<GroupLetter, string[]>,
    [drawGroups],
  )

  const provisionalSlots = useMemo(() => {
    if (!isPreKnockout) return null
    if (Object.values(groupTeamsMap).some((teams) => teams.length < 4)) return null

    const groupResults = computeGroupResults(groupTeamsMap, groupMatches)
    const qualifiedThirdGroups = computeQualifiedThirdGroups(groupResults, groupMatches)
    const r32 = buildR32Matchups(groupResults, qualifiedThirdGroups)

    const slots: Record<string, KnockoutSlotState> = {}
    for (const id of R32_SLOT_IDS) slots[id] = emptySlot(id)
    for (const id of [...R16_SLOT_IDS, ...QF_SLOT_IDS, ...SF_SLOT_IDS, FINAL_SLOT_ID, THIRD_SLOT_ID]) {
      slots[id] = emptySlot(id)
    }
    for (const m of r32) {
      slots[m.slotId] = { ...slots[m.slotId], team1Id: m.team1Id, team2Id: m.team2Id }
    }
    return slots
  }, [isPreKnockout, groupTeamsMap, groupMatches])

  /** 조 1위/2위 슬롯이 더 이상 바뀔 수 없는 확정 상태인지: 조별 [1위확정?, 2위확정?] */
  const groupLocks = useMemo(() => {
    if (!isPreKnockout) return null
    const locks: Partial<Record<GroupLetter, boolean[]>> = {}
    for (const group of GROUP_LETTERS) {
      const teamIds = groupTeamsMap[group]
      if (!teamIds || teamIds.length < 4) continue
      locks[group] = computeExactRankLocks(teamIds, groupMatches.filter((m) => m.group === group))
    }
    return locks
  }, [isPreKnockout, groupTeamsMap, groupMatches])

  /** 슬롯별 [team1 확정?, team2 확정?] — 3위팀 슬롯은 전체 조가 끝나기 전까지 항상 미확정. */
  const confirmedBySlot = useMemo(() => {
    if (!groupLocks) return null
    const map: Record<string, [boolean, boolean]> = {}
    for (const slot of R32_SLOTS) {
      const resolve = (ref: (typeof slot)['team1']): boolean => {
        if (ref.type === 'third') return false
        const locks = groupLocks[ref.group]
        if (!locks) return false
        return ref.type === 'winner' ? locks[0] : locks[1]
      }
      map[slot.id] = [resolve(slot.team1), resolve(slot.team2)]
    }
    return map
  }, [groupLocks])

  const displaySlots = isPreKnockout ? provisionalSlots : knockoutSlots

  if (!displaySlots) {
    return (
      <GlassCard className="p-6 text-center text-sm text-gray-400">
        조추첨이 완료되면 잠정 대진을 미리 볼 수 있습니다.
      </GlassCard>
    )
  }

  return (
    <div>
      {isPreKnockout && (
        <p className="mb-3 text-center text-xs font-semibold text-amber-300">
          ⚠ 잠정 대진 — 조별리그가 지금 끝난다면의 예상이며, "확정" 표시가 없는 팀은 남은 경기 결과에
          따라 계속 바뀔 수 있습니다.
        </p>
      )}
      <p className="mb-2 text-center text-[11px] text-gray-500 sm:hidden">← 옆으로 스크롤하여 전체 대진표를 확인하세요 →</p>
      <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <div key={col.title} className="flex shrink-0 flex-col gap-3">
            <h3 className="font-display text-center text-sm font-semibold tracking-wide text-emerald-300/90">{col.title}</h3>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {col.slotIds.map((id) => (
                <MatchNode key={id} slot={displaySlots[id]} confirmed={isPreKnockout ? confirmedBySlot?.[id] : undefined} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
