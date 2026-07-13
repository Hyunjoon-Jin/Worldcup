import { useConditionStore } from './useConditionStore'
import { useDrawStore } from './useDrawStore'
import { useMomentumStore } from './useMomentumStore'
import { useProgressStore } from './useProgressStore'
import { useSimulationStore } from './useSimulationStore'
import type { DrawLogEntry, DrawState } from '../engine/drawEngine'

/**
 * 한 대회의 전체 상태 스냅샷 (D3). 조추첨·진행·컨디션을 한 덩어리로 담아 저장 슬롯에
 * 보관하고 나중에 그대로 복원할 수 있게 한다.
 */
export interface TournamentSnapshot {
  draw: {
    state: DrawState
    log: DrawLogEntry[]
    isComplete: boolean
    seed: string | null
  }
  progress: ReturnType<typeof captureProgress>
  condition: { offsets: Record<string, number> }
}

function captureProgress() {
  const p = useProgressStore.getState()
  return {
    schedule: p.schedule,
    phase: p.phase,
    currentDay: p.currentDay,
    groupMatches: p.groupMatches,
    lastBatchDate: p.lastBatchDate,
    lastBatchTimeSlot: p.lastBatchTimeSlot,
    lastDayGroupResults: p.lastDayGroupResults,
    lastDeltaByGroup: p.lastDeltaByGroup,
    groupResults: p.groupResults,
    qualifiedThirdGroups: p.qualifiedThirdGroups,
    knockoutSlots: p.knockoutSlots,
    lastKnockoutResults: p.lastKnockoutResults,
    champion: p.champion,
  }
}

/** 현재 진행 중인 대회 상태를 스냅샷으로 캡처한다(깊은 복제하여 이후 변경과 분리). */
export function captureSnapshot(): TournamentSnapshot {
  const draw = useDrawStore.getState()
  const condition = useConditionStore.getState()
  const snapshot: TournamentSnapshot = {
    draw: { state: draw.state, log: draw.log, isComplete: draw.isComplete, seed: draw.seed },
    progress: captureProgress(),
    condition: { offsets: condition.offsets },
  }
  // 직렬화-역직렬화로 깊은 복제해 이후 진행이 슬롯 데이터를 오염시키지 않게 한다.
  return JSON.parse(JSON.stringify(snapshot))
}

/** 스냅샷을 각 store에 되돌려 대회를 복원하고, 파생 상태(모멘텀·확률)를 갱신한다. */
export function restoreSnapshot(snap: TournamentSnapshot): void {
  const clone: TournamentSnapshot = JSON.parse(JSON.stringify(snap))
  useDrawStore.setState({
    state: clone.draw.state,
    log: clone.draw.log,
    history: [],
    isComplete: clone.draw.isComplete,
    seed: clone.draw.seed,
  })
  useConditionStore.setState({ offsets: clone.condition.offsets })
  useProgressStore.setState(clone.progress)
  useMomentumStore.getState().recompute()
  useSimulationStore.getState().reset()
  useSimulationStore.getState().run()
}
