import type { GroupLetter } from '../types/group'

// 2026 월드컵 규정: 개최국 3팀은 조추첨 전에 각자의 조 1번 시드로 고정 배정된다.
export const HOST_SLOTS: Record<string, GroupLetter> = {
  MEX: 'A',
  CAN: 'B',
  USA: 'D',
}

export const GROUP_LETTERS: GroupLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
