import { useConditionStore } from './useConditionStore'
import { useDrawStore } from './useDrawStore'
import { useProgressStore } from './useProgressStore'
import { useSelectionStore } from './useSelectionStore'
import { useSimulationStore } from './useSimulationStore'

/**
 * 새 대회를 시작할 때 관련된 모든 store를 한 번에 원자적으로 초기화한다 (A4).
 *
 * 조추첨을 다시 시작하면 이전 조추첨에 딸려있던 일정 진행 상황(경기 결과·토너먼트·우승팀)과
 * 확률 계산 캐시까지 전부 초기화하고, 팀별 컨디션도 새 대회 기준으로 다시 뽑아 이전 대회와
 * 똑같이 반복되지 않게 한다. 초기화 대상이 여러 store에 흩어져 누락되는 일을 막기 위해
 * 단일 진입점으로 모은다.
 *
 * 샌드박스 능력치 조정은 사용자가 의도적으로 만든 설정이므로 대회를 새로 시작해도 유지한다.
 */
export function resetTournament(): void {
  useDrawStore.getState().reset()
  useProgressStore.getState().reset()
  useSimulationStore.getState().reset()
  useSelectionStore.getState().clearTeam()
  useConditionStore.getState().reroll()
}

/**
 * 예선 통과 48개국으로 본선을 시작한다 (지역예선 Q4). 랭킹 기반 동적 포트로 조추첨을 즉시
 * 실행하고, 진행/확률/선택을 초기화한 뒤 팀 컨디션을 새로 뽑는다.
 */
export function startFinalsFromQualification(teamIds48: string[], seed?: string): void {
  useDrawStore.getState().drawFromField(teamIds48, seed)
  useProgressStore.getState().reset()
  useSimulationStore.getState().reset()
  useSelectionStore.getState().clearTeam()
  useConditionStore.getState().reroll()
}
