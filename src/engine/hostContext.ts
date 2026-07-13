import { HOST_SLOTS } from '../data/hostSlots'

/**
 * 현재 대회의 개최국 컨텍스트. 커리어(연속 대회) 모드에서 대회마다 개최국이 바뀌므로,
 * 정적 isHost 플래그(2026 고정) 대신 이 모듈이 "지금 대회의 개최국"을 제공한다.
 * 홈 이점(hostAdvFor)·포트 계산·조추첨 고정 배정이 모두 이 값을 참조한다.
 */
const DEFAULT_HOSTS = Object.keys(HOST_SLOTS) // ['MEX','CAN','USA']
let currentHostIds = new Set<string>(DEFAULT_HOSTS)

/** 현재 대회 개최국을 설정한다(커리어 store가 대회 시작 시 호출). */
export function setCurrentHosts(ids: string[]): void {
  currentHostIds = new Set(ids.length > 0 ? ids : DEFAULT_HOSTS)
}

/** teamId가 현재 대회 개최국인지. */
export function isCurrentHost(teamId: string): boolean {
  return currentHostIds.has(teamId)
}

/** 현재 대회 개최국 ID 목록. */
export function getCurrentHostIds(): string[] {
  return [...currentHostIds]
}
