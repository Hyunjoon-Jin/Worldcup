import type { GroupLetter } from '../types/group'

export type BracketSlotRef =
  | { type: 'winner'; group: GroupLetter }
  | { type: 'runnerup'; group: GroupLetter }
  | { type: 'third' }

export interface R32SlotDef {
  id: string
  half: 'A' | 'B'
  kind: 'WR' | 'WT' | 'RR'
  /** for WT slots, this is the group whose 3rd-place team must NOT be assigned here */
  team1: BracketSlotRef
  team2: BracketSlotRef
}

// 32강 고정 슬롯 구조: 전체 12개 조를 두 개의 브래킷 절반(6개조씩)으로 나누고,
// 각 절반 안에서 "1위vs2위(WR) 2매치 + 1위vs3위(WT) 4매치 + 2위끼리(RR) 2매치" = 8매치를 편성한다.
// 이는 실제 FIFA 규정의 4:8:4(WR:WT:RR) 비율과 "자기 조 팀과 조기 재대결 금지"를 만족하는
// 구조적으로 동일한 형태의 대진이며, FIFA 공식 495종 조합표(Annex C)의 1:1 재현은 아니다.
// 배열 순서(half A 8개 → half B 8개, 각 half 내부는 표준 브래킷 진행 순서)는 그대로
// R16/QF/SF/Final 진행에 "인접 2개씩 페어링"으로 재사용된다. 3위팀은 자기 조 1위와 R32에서,
// 인접 슬롯 고정 팀(승자/준우승)과 R16에서 다시 만나지 않도록 배정된다(tournamentSimulation).
export const HALF_A_GROUPS: GroupLetter[] = ['A', 'B', 'C', 'D', 'E', 'F']
export const HALF_B_GROUPS: GroupLetter[] = ['G', 'H', 'I', 'J', 'K', 'L']

export const R32_SLOTS: R32SlotDef[] = [
  // --- Half A ---
  { id: 'M1', half: 'A', kind: 'WR', team1: { type: 'winner', group: 'A' }, team2: { type: 'runnerup', group: 'B' } },
  { id: 'M2', half: 'A', kind: 'WR', team1: { type: 'winner', group: 'C' }, team2: { type: 'runnerup', group: 'D' } },
  { id: 'M3', half: 'A', kind: 'WT', team1: { type: 'winner', group: 'B' }, team2: { type: 'third' } },
  { id: 'M4', half: 'A', kind: 'WT', team1: { type: 'winner', group: 'D' }, team2: { type: 'third' } },
  { id: 'M5', half: 'A', kind: 'WT', team1: { type: 'winner', group: 'E' }, team2: { type: 'third' } },
  { id: 'M6', half: 'A', kind: 'WT', team1: { type: 'winner', group: 'F' }, team2: { type: 'third' } },
  { id: 'M7', half: 'A', kind: 'RR', team1: { type: 'runnerup', group: 'A' }, team2: { type: 'runnerup', group: 'C' } },
  { id: 'M8', half: 'A', kind: 'RR', team1: { type: 'runnerup', group: 'E' }, team2: { type: 'runnerup', group: 'F' } },
  // --- Half B ---
  { id: 'M9', half: 'B', kind: 'WR', team1: { type: 'winner', group: 'G' }, team2: { type: 'runnerup', group: 'H' } },
  { id: 'M10', half: 'B', kind: 'WR', team1: { type: 'winner', group: 'I' }, team2: { type: 'runnerup', group: 'J' } },
  { id: 'M11', half: 'B', kind: 'WT', team1: { type: 'winner', group: 'H' }, team2: { type: 'third' } },
  { id: 'M12', half: 'B', kind: 'WT', team1: { type: 'winner', group: 'J' }, team2: { type: 'third' } },
  { id: 'M13', half: 'B', kind: 'WT', team1: { type: 'winner', group: 'K' }, team2: { type: 'third' } },
  { id: 'M14', half: 'B', kind: 'WT', team1: { type: 'winner', group: 'L' }, team2: { type: 'third' } },
  { id: 'M15', half: 'B', kind: 'RR', team1: { type: 'runnerup', group: 'G' }, team2: { type: 'runnerup', group: 'I' } },
  { id: 'M16', half: 'B', kind: 'RR', team1: { type: 'runnerup', group: 'K' }, team2: { type: 'runnerup', group: 'L' } },
]

/** WT 슬롯들의 소속 조(순서대로) — 3위팀 동적 배정 시 자기 조 재대결 회피에 사용 */
export const WT_SLOT_GROUPS: GroupLetter[] = R32_SLOTS.filter((s) => s.kind === 'WT').map(
  (s) => (s.team1 as { type: 'winner'; group: GroupLetter }).group,
)

export const R32_SLOT_IDS: string[] = R32_SLOTS.map((s) => s.id)
export const R16_SLOT_IDS = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8']
export const QF_SLOT_IDS = ['O1', 'O2', 'O3', 'O4']
export const SF_SLOT_IDS = ['P1', 'P2']
export const FINAL_SLOT_ID = 'FINAL'
export const THIRD_SLOT_ID = 'THIRD'

/** 라운드별 슬롯 id 목록(진행 순서 = R32_SLOTS와 동일하게 half A가 먼저 오도록 구성) */
export const ROUND_SLOT_IDS = {
  R32: R32_SLOT_IDS,
  R16: R16_SLOT_IDS,
  QF: QF_SLOT_IDS,
  SF: SF_SLOT_IDS,
  FINAL: [FINAL_SLOT_ID],
  THIRD: [THIRD_SLOT_ID],
} as const
