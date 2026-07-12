import type { MatchResult } from './match'

/** 매치데이·조 정보가 붙은 예선 경기 (B1 라운드별 진행). */
export interface QualMatch extends MatchResult {
  /** 라운드(1부터) */
  matchday: number
  /** 조 인덱스(0부터) */
  group: number
}

/** 한 대륙 예선의 결과 (지역예선). */
export interface QualificationResult {
  confederation: string
  /** 최종 순위(팀 ID, 상위→하위) */
  standings: string[]
  /** 조별 순위(각 조의 팀 ID를 순위순으로). 단일리그면 길이 1 (H1) */
  groups: string[][]
  /** 본선 직행 팀 */
  qualified: string[]
  /** 대륙간 플레이오프로 가는 팀 */
  playoff: string[]
  /** 예선에서 치른 모든 경기(매치데이·조 태그 포함) */
  matches: QualMatch[]
  /** 이 대륙의 총 라운드 수(B1) */
  matchdays: number
}
