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

/**
 * 2026 이후 대회 로테이션(가상). 실제 미래 개최지와 무관한 시뮬레이션용 순환.
 * 순환 주기 40대회(160년): 대륙을 번갈아 배치해 순환 경계(마지막→처음)를 포함한 어떤 연속 두
 * 대회도 같은 나라가 개최하지 않는다(hostRotation 테스트로 강제). 연도는 대회마다 4년씩 증가.
 */
export const HOST_ROTATION: HostEdition[] = [
  { year: 2026, hostIds: ['MEX', 'CAN', 'USA'] }, // 실제 2026 개최
  { year: 2030, hostIds: ['ESP', 'POR', 'MAR'] }, // 실제 2030(유럽·아프리카 공동)
  { year: 2034, hostIds: ['KSA'] }, // 실제 2034(아시아)
  { year: 2038, hostIds: ['BRA', 'ARG'] }, // 남미 공동
  { year: 2042, hostIds: ['ENG'] }, // 유럽
  { year: 2046, hostIds: ['JPN', 'KOR'] }, // 아시아 공동
  { year: 2050, hostIds: ['NGA'] }, // 아프리카
  { year: 2054, hostIds: ['URU', 'PAR'] }, // 남미 공동
  { year: 2058, hostIds: ['FRA'] }, // 유럽
  { year: 2062, hostIds: ['AUS', 'NZL'] }, // 오세아니아 공동
  { year: 2066, hostIds: ['EGY'] }, // 아프리카
  { year: 2070, hostIds: ['USA', 'CAN'] }, // 북중미 공동
  { year: 2074, hostIds: ['GER'] }, // 유럽
  { year: 2078, hostIds: ['QAT'] }, // 아시아
  { year: 2082, hostIds: ['RSA'] }, // 아프리카
  { year: 2086, hostIds: ['COL', 'ECU'] }, // 남미 공동
  { year: 2090, hostIds: ['ITA'] }, // 유럽
  { year: 2094, hostIds: ['CHN'] }, // 아시아
  { year: 2098, hostIds: ['SEN'] }, // 아프리카
  { year: 2102, hostIds: ['CHI', 'PER'] }, // 남미 공동
  { year: 2106, hostIds: ['NED', 'BEL'] }, // 유럽 공동
  { year: 2110, hostIds: ['IRN'] }, // 아시아
  { year: 2114, hostIds: ['MAR'] }, // 아프리카
  { year: 2118, hostIds: ['MEX'] }, // 북중미
  { year: 2122, hostIds: ['POR', 'ESP'] }, // 유럽 공동
  { year: 2126, hostIds: ['KOR', 'JPN'] }, // 아시아 공동
  { year: 2130, hostIds: ['ARG', 'URU'] }, // 남미 공동(월드컵 200주년)
  { year: 2134, hostIds: ['GHA'] }, // 아프리카
  { year: 2138, hostIds: ['ENG'] }, // 유럽
  { year: 2142, hostIds: ['AUS'] }, // 오세아니아/아시아
  { year: 2146, hostIds: ['CRC', 'PAN'] }, // 북중미 공동
  { year: 2150, hostIds: ['FRA'] }, // 유럽
  { year: 2154, hostIds: ['KSA'] }, // 아시아
  { year: 2158, hostIds: ['ALG'] }, // 아프리카
  { year: 2162, hostIds: ['BRA'] }, // 남미
  { year: 2166, hostIds: ['GER'] }, // 유럽
  { year: 2170, hostIds: ['QAT'] }, // 아시아
  { year: 2174, hostIds: ['CIV'] }, // 아프리카
  { year: 2178, hostIds: ['USA'] }, // 북중미
  // 순환 경계: 다음은 다시 2026(MEX·CAN·USA)이므로 그 셋과 겹치지 않는 유럽 공동으로 마무리.
  { year: 2182, hostIds: ['NED', 'BEL'] }, // 유럽 공동
]

/**
 * edition 인덱스(0부터)에 해당하는 개최 정보. 로테이션을 순환한다.
 * HOST_ROTATION은 순환 경계를 포함해 인접 대회 간 개최국이 겹치지 않도록 구성돼 있어,
 * 어떤 연속 두 대회도 같은 나라가 개최하지 않는다(hostRotation 테스트로 강제).
 */
export function hostEditionAt(index: number): HostEdition {
  const base = HOST_ROTATION[index % HOST_ROTATION.length]
  // 한 바퀴 돈 뒤에도 연도가 계속 증가하도록 4년씩 더한다.
  const cycles = Math.floor(index / HOST_ROTATION.length)
  return { year: base.year + cycles * HOST_ROTATION.length * 4, hostIds: base.hostIds }
}
