/**
 * 실제 FIFA가 채택해온 4팀조 라운드로빈 로테이션(포트 시드 기준).
 * MD3(마지막 라운드)는 담합 방지를 위해 조 내 두 경기가 항상 동시에 열려야 하므로
 * 상위 두 시드(S1,S2)와 하위 두 시드(S3,S4)를 짝짓는다.
 */
export const FIXTURE_ROTATION: Array<{ matchday: 1 | 2 | 3; homeSeed: 1 | 2 | 3 | 4; awaySeed: 1 | 2 | 3 | 4 }> = [
  { matchday: 1, homeSeed: 1, awaySeed: 4 },
  { matchday: 1, homeSeed: 2, awaySeed: 3 },
  { matchday: 2, homeSeed: 1, awaySeed: 3 },
  { matchday: 2, homeSeed: 4, awaySeed: 2 },
  { matchday: 3, homeSeed: 1, awaySeed: 2 },
  { matchday: 3, homeSeed: 3, awaySeed: 4 },
]
