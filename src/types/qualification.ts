import type { MatchResult } from './match'

/** 한 대륙 예선의 결과 (지역예선). */
export interface QualificationResult {
  confederation: string
  /** 최종 순위(팀 ID, 상위→하위) */
  standings: string[]
  /** 본선 직행 팀 */
  qualified: string[]
  /** 대륙간 플레이오프로 가는 팀 */
  playoff: string[]
  /** 예선에서 치른 모든 경기 */
  matches: MatchResult[]
}
