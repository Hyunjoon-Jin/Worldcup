import { OPPONENT_FORECAST_ITERATIONS, SCENARIO_ITERATIONS } from './config'
import { buildSnapshot } from './buildSnapshot'
import {
  runOpponentForecast as runOpponentForecastCore,
  runTeamScenario,
  type RoundOpponentForecast,
  type TeamScenarioResult,
} from './simCore'

export type { RoundOpponentForecast, TeamScenarioResult }

/**
 * 메인스레드용 얇은 래퍼 (v2 #42 / H1). 실제 시뮬레이션 로직은 순수 모듈 simCore에 있고,
 * 여기서는 현재 store 상태로 스냅샷을 만들어 넘긴다. 대규모 확률 계산(대시보드)은 워커에서
 * 실행되며(useSimulationStore), 이 함수들은 팀 상세의 소규모 온디맨드 계산에 쓰인다.
 */
export function runTeamScenarioSimulation(teamId: string, iterations = SCENARIO_ITERATIONS): TeamScenarioResult {
  return runTeamScenario(buildSnapshot(), teamId, iterations)
}

export function runOpponentForecast(teamId: string, iterations = OPPONENT_FORECAST_ITERATIONS): RoundOpponentForecast[] {
  return runOpponentForecastCore(buildSnapshot(), teamId, iterations)
}
