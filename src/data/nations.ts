import { TEAMS, TEAMS_BY_ID } from './teams'
import { QUALIFIER_TEAMS } from './qualifierTeams'
import type { Confederation, Team } from '../types/team'

/**
 * 본선 진출국 + 예선 참가국을 합친 전체 국가 레지스트리 (지역예선). 예선 시뮬레이션과
 * 타이브레이커(FIFA 랭킹 비교)가 본선/비본선을 구분 없이 조회할 수 있게 한다.
 */
export const ALL_NATIONS: Team[] = [...TEAMS, ...QUALIFIER_TEAMS]

export const ALL_NATIONS_BY_ID: Record<string, Team> = {
  ...TEAMS_BY_ID,
  ...Object.fromEntries(QUALIFIER_TEAMS.map((t) => [t.id, t])),
}

export function nationsByConfederation(confed: Confederation): Team[] {
  return ALL_NATIONS.filter((t) => t.confederation === confed)
}

/** 예선 참가국 능력치 맵(base). 컨디션/샌드박스는 상위 계층에서 덧씌울 수 있다. */
export function baseRatingsMap(teamIds: string[]): Record<string, import('../types/team').TeamRatings> {
  return Object.fromEntries(teamIds.map((id) => [id, ALL_NATIONS_BY_ID[id].baseRatings]))
}
