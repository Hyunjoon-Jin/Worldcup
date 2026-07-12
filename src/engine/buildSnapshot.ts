import { TEAMS } from '../data/teams'
import { getRatings } from './matchEngine'
import { useDrawStore } from '../store/useDrawStore'
import { useProgressStore } from '../store/useProgressStore'
import type { SimSnapshot } from './simCore'
import type { KnockoutMatch } from '../types/match'

/**
 * 현재 store 상태로부터 직렬화 가능한 시뮬레이션 스냅샷을 만든다 (v2 #42 / H1).
 * store를 읽는 유일한 지점이며 메인스레드에서만 호출한다. 이 스냅샷을 Web Worker로 넘기면
 * 워커는 store 없이 동일한 시뮬레이션을 수행할 수 있다.
 */
export function buildSnapshot(): SimSnapshot {
  const drawGroups = useDrawStore.getState().state.groups
  const progress = useProgressStore.getState()

  const ratings = Object.fromEntries(TEAMS.map((t) => [t.id, getRatings(t.id)]))

  const lockedKnockoutResults: Record<string, KnockoutMatch | null> = {}
  for (const [id, slot] of Object.entries(progress.knockoutSlots)) lockedKnockoutResults[id] = slot.result

  return {
    drawGroups,
    scheduleGroupMatches: progress.schedule?.groupMatches ?? null,
    lockedGroupMatches: progress.groupMatches,
    lockedKnockoutResults,
    ratings,
  }
}
