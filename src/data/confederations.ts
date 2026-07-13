import type { Confederation } from '../types/team'

export interface ConfedSlots {
  /** 본선 직행 슬롯 수(CONCACAF의 direct에는 개최 3국이 포함된다) */
  direct: number
  /** 대륙간 플레이오프로 보내는 팀 수 */
  playoff: number
}

/**
 * 2026 북중미 월드컵 대륙별 슬롯 배분 (지역예선 Q0). 합계 = 46 직행 + 2(대륙간 PO 승자) = 48.
 * 세부 예선 포맷은 대륙별 엔진에서 근사하되, 이 슬롯 수는 정확히 지킨다.
 */
export const SLOT_ALLOCATION: Record<Confederation, ConfedSlots> = {
  UEFA: { direct: 16, playoff: 0 },
  CAF: { direct: 9, playoff: 1 },
  AFC: { direct: 8, playoff: 1 },
  CONMEBOL: { direct: 6, playoff: 1 },
  CONCACAF: { direct: 6, playoff: 2 }, // 개최 3국(USA·MEX·CAN) 자동 포함
  OFC: { direct: 1, playoff: 1 },
}

/** 대륙간 플레이오프에서 최종 확정되는 본선 티켓 수. */
export const INTER_CONFED_PLAYOFF_SLOTS = 2
