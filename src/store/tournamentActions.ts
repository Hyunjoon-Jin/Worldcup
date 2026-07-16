import { useConditionStore } from './useConditionStore'
import { useDrawStore } from './useDrawStore'
import { useProgressStore } from './useProgressStore'
import { useSelectionStore } from './useSelectionStore'
import { useSimulationStore } from './useSimulationStore'
import { useQualificationStore } from './useQualificationStore'
import { useSaveSlotsStore } from './useSaveSlotsStore'
import { useSandboxStore } from './useSandboxStore'
import { usePerformanceStore } from './usePerformanceStore'
import { useCareerStore } from './useCareerStore'
import { useHistoryStore } from './useHistoryStore'
import { useRankHistoryStore } from './useRankHistoryStore'
import { useContinentalStore } from './useContinentalStore'
import { useContinentalHistoryStore } from './useContinentalHistoryStore'
import { useSeasonStore } from './useSeasonStore'
import { finalsFormDeltas } from '../engine/finalsForm'
import { editionEndRankingPoints, type FinalsResults } from '../engine/qualification/ranking'
import { buildEditionSnapshot } from '../engine/history'

const NO_FINALS: FinalsResults = { groupMatches: [], knockoutMatches: [] }

/**
 * 조추첨 포트 산정용 "현재 FIFA 점수"를 계산한다. 이월 점수(이전 대회 누적) + 이번 대회 예선
 * 전체 결과를 반영한 점수로, 최신 FIFA 랭킹이 포트에 반영되게 한다. 예선 결과가 없으면 undefined.
 */
function currentRankingPoints(): Record<string, number> | undefined {
  const result = useQualificationStore.getState().result
  if (!result) return undefined
  const carried = useCareerStore.getState().rankingBase
  const carriedArg = Object.keys(carried).length > 0 ? carried : undefined
  return editionEndRankingPoints(result, NO_FINALS, carriedArg)
}

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
 *
 * formOffsets(예선 폼)를 넘기면 새 컨디션 위에 예선 성적을 추가로 반영한다 → 본선 전력·
 * 우승 확률이 예선 실황(잘 나간 팀은 폼↑, 부진한 팀은 폼↓)을 반영한다.
 */
export function startFinalsFromQualification(
  teamIds48: string[],
  seed?: string,
  formOffsets?: Record<string, number>,
): void {
  useDrawStore.getState().drawFromField(teamIds48, seed, currentRankingPoints())
  useProgressStore.getState().reset()
  useSimulationStore.getState().reset()
  useSelectionStore.getState().clearTeam()
  useConditionStore.getState().reroll()
  if (formOffsets) useConditionStore.getState().applyFormOffsets(formOffsets)
}

/**
 * 예선 통과 48개국으로 본선 조추첨을 "준비"만 한다 (순차 진행용). 조추첨을 즉시 끝내지 않고,
 * 개최국 사전 배치 + 포트만 구성해 두어, 조추첨 화면에서 사용자가 한 팀씩(또는 시드로) 직접
 * 진행할 수 있게 한다. 예선 폼(formOffsets)은 본선 컨디션에 반영하고, 진행/확률/선택을 초기화한다.
 */
export function prepareFinalsDrawFromQualification(teamIds48: string[], formOffsets?: Record<string, number>): void {
  useDrawStore.getState().prepareFromField(teamIds48, currentRankingPoints())
  useProgressStore.getState().reset()
  useSimulationStore.getState().reset()
  useSelectionStore.getState().clearTeam()
  useConditionStore.getState().reroll()
  if (formOffsets) useConditionStore.getState().applyFormOffsets(formOffsets)
}

/**
 * 방금 끝난 본선을 마무리하고 "다음 대회"로 흐름을 이어간다 (커리어 모드).
 *
 * 1) 방금 끝난 본선 성적(우승·준우승·토너먼트 진출 깊이)을 커리어 폼 보정으로 환산해
 *    useCareerStore.advanceEdition에 넘긴다 → 커리어 폼이 감쇠 누적되고, 다음 대회 개최국이
 *    로테이션에서 새로 선정된다(hostContext에도 반영).
 * 2) 예선·조추첨·본선 진행·확률·선택을 초기화하고 컨디션을 새로 뽑는다.
 * 3) 새 개최국·누적 커리어 폼을 반영해 새 대회 지역예선을 시작한다.
 *
 * 본선이 아직 끝나지 않았으면(우승팀 미확정) 아무것도 하지 않는다.
 */
export function advanceToNextEdition(): void {
  const progress = useProgressStore.getState()
  if (progress.phase !== 'complete') return

  const deltas = finalsFormDeltas(progress.knockoutSlots, progress.champion)
  // 이번 대회(예선+본선)까지 반영된 FIFA 점수를 계산해 다음 대회로 이월한다(본선 반영 랭킹 회귀 방지).
  const qualResult = useQualificationStore.getState().result
  const carried = useCareerStore.getState().rankingBase
  const carriedArg = Object.keys(carried).length > 0 ? carried : undefined
  const finals: FinalsResults = {
    groupMatches: progress.groupMatches,
    knockoutMatches: Object.values(progress.knockoutSlots)
      .map((s) => s.result)
      .filter((m): m is NonNullable<typeof m> => m != null),
  }
  const endPoints = qualResult ? editionEndRankingPoints(qualResult, finals, carriedArg) : carried

  // 방금 끝난 대회를 역대 기록에 스냅샷으로 축적(국가별 전적·최종 성적·종료 시점 FIFA 순위).
  if (qualResult) {
    const career = useCareerStore.getState()
    useHistoryStore.getState().recordEdition(
      buildEditionSnapshot({
        year: career.year,
        hostIds: career.hostIds,
        champion: progress.champion,
        qualified48: qualResult.qualified48,
        groupMatches: finals.groupMatches,
        knockoutMatches: finals.knockoutMatches,
        endPoints,
      }),
    )
  }

  // 다음 대회 개최국 선정 + 커리어 폼 누적(감쇠) + FIFA 점수 이월. 이후 시뮬레이션이 새 개최국을 참조한다.
  useCareerStore.getState().advanceEdition(deltas, endPoints)

  // 이전 대회의 진행 이력을 정리하고(저장 슬롯·샌드박스는 유지) 새 예선을 시작한다.
  useDrawStore.getState().reset()
  useProgressStore.getState().reset()
  useSimulationStore.getState().reset()
  useSelectionStore.getState().clearTeam()
  useConditionStore.getState().reroll()
  useQualificationStore.getState().reset()
  useQualificationStore.getState().simulate()
}

/**
 * 진행했던 모든 이력을 삭제한다 — 예선·조추첨·일정/토너먼트 진행·확률·저장 슬롯·샌드박스
 * 조정을 전부 초기화하고 컨디션을 새로 뽑는다. 테마·효과음·글자 크기·내 팀 같은 개인 환경설정은
 * 유지한다(진행 이력만 삭제). 각 store의 reset을 호출하므로 persist(localStorage)도 함께 비워진다.
 */
export function clearAllHistory(): void {
  useQualificationStore.getState().reset()
  useDrawStore.getState().reset()
  useProgressStore.getState().reset()
  useSimulationStore.getState().reset()
  useSelectionStore.getState().clearTeam()
  useSaveSlotsStore.getState().clearAll()
  useSandboxStore.getState().resetAll()
  usePerformanceStore.getState().reset()
  useCareerStore.getState().reset()
  useHistoryStore.getState().reset() // 커리어 역대 기록(팀별 통산 성적)도 함께 삭제
  useRankHistoryStore.getState().reset() // 월별 FIFA 랭킹 이력도 함께 삭제
  // 대륙컵 진행/역대 기록(트로피·통산 성적)과 시즌(캘린더) 커서도 함께 삭제한다.
  // 이걸 빠뜨리면 '전체 삭제' 후에도 대륙컵 우승·역대 기록이 그대로 남는다(회귀 버그).
  useContinentalStore.getState().reset()
  useContinentalHistoryStore.getState().reset()
  useSeasonStore.getState().reset()
  useConditionStore.getState().reroll()
}
