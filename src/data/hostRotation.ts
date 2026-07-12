/**
 * 연속 대회(커리어) 모드의 개최국 로테이션. 각 대회(edition)마다 새 개최국을 선정한다.
 * 실제 월드컵처럼 대륙을 옮겨가며 개최되도록 대륙이 다양한 후보를 순서대로 배치했다.
 * 각 항목은 개최국 팀 ID 배열(단독 또는 공동 개최)이다.
 */
export interface HostEdition {
  /** 대회 연도 */
  year: number
  /** 개최국 팀 ID(공동 개최 가능) */
  hostIds: string[]
}

/** 2026 이후 대회 로테이션(가상). 실제 미래 개최지와 무관한 시뮬레이션용 순환. */
export const HOST_ROTATION: HostEdition[] = [
  { year: 2026, hostIds: ['MEX', 'CAN', 'USA'] }, // 실제 2026 개최
  { year: 2030, hostIds: ['ESP', 'POR', 'MAR'] }, // 유럽·아프리카 공동(가상)
  { year: 2034, hostIds: ['KSA'] }, // 아시아 단독
  { year: 2038, hostIds: ['BRA', 'ARG'] }, // 남미 공동
  { year: 2042, hostIds: ['ENG'] }, // 유럽 단독
  { year: 2046, hostIds: ['JPN', 'KOR'] }, // 아시아 공동
  { year: 2050, hostIds: ['NGA'] }, // 아프리카 단독
  { year: 2054, hostIds: ['AUS'] }, // 오세아니아/아시아
  { year: 2058, hostIds: ['FRA'] },
  { year: 2062, hostIds: ['USA', 'MEX'] },
]

/** edition 인덱스(0부터)에 해당하는 개최 정보. 로테이션을 순환한다. */
export function hostEditionAt(index: number): HostEdition {
  const base = HOST_ROTATION[index % HOST_ROTATION.length]
  // 한 바퀴 돈 뒤에도 연도가 계속 증가하도록 4년씩 더한다.
  const cycles = Math.floor(index / HOST_ROTATION.length)
  return { year: base.year + cycles * HOST_ROTATION.length * 4, hostIds: base.hostIds }
}
