/// <reference lib="webworker" />
import { CUP_FORMATS, type CupId } from '../data/continental/formats'
import { computeCupProbabilitiesLive, type CupProbabilities } from '../engine/continental/cupProbability'
import type { CupResult } from '../engine/continental/runCup'
import type { TeamRatings } from '../types/team'

interface RunMessage {
  cupId: CupId
  result: CupResult
  revealedGroupMd: number
  revealedKoRounds: number
  ratings: Record<string, TeamRatings>
  hostIds: string[]
  iterations: number
  seedBase: string
}

export type CupWorkerOut = { type: 'result'; probabilities: CupProbabilities }

// 대륙컵 실시간(조건부) 확률 몬테카를로를 메인스레드 밖(워커)에서 돌려 진행 중 UI 끊김을 없앤다 (F).
// 능력치는 이미 정적 base 스냅샷(직렬화 가능)으로 넘어오고, runCupLocked는 CupResult를 그대로 받으므로
// 예선 워커와 달리 함수형 lookup 재구성이 필요 없다 — 계산 함수를 한 번 호출해 결과만 돌려준다.
self.onmessage = (e: MessageEvent<RunMessage>) => {
  const { cupId, result, revealedGroupMd, revealedKoRounds, ratings, hostIds, iterations, seedBase } = e.data
  const format = CUP_FORMATS[cupId]
  const probabilities = computeCupProbabilitiesLive(format, result, revealedGroupMd, revealedKoRounds, ratings, hostIds, iterations, seedBase)
  ;(self as unknown as Worker).postMessage({ type: 'result', probabilities })
}
