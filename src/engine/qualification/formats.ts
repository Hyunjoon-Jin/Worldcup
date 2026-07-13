import type { Confederation } from '../../types/team'

/**
 * 대륙별 예선 "포맷" 설정을 한곳에 모은다 (C4 포맷 데이터 주도화).
 * 슬롯 수는 data/confederations.ts의 SLOT_ALLOCATION이 담당하고, 여기서는
 * 조 수·라운드 방식·다단계 구조 같은 진행 포맷만 선언적으로 기술한다.
 * 규정이 바뀌면(예: UEFA 조 수 변경, AFC 라운드 구조 변경) 이 파일만 고치면 된다.
 */

/** 단일 조별 스테이지(UEFA·CAF·CONMEBOL·OFC): 조 수 + 홈&어웨이 여부. */
export interface GroupsFormat {
  kind: 'groups'
  numGroups: number
  doubleRound: boolean
}

/** AFC 다단계(A3): 1·2차 예비예선 → 3차 조 → 4차 조 → 5차 단판 PO. */
export interface AfcFormat {
  kind: 'afc'
  /** 2차 예비예선 조 수(각 조 1·2위가 3차행). 3차 진입 팀 수 = round2Groups × 2. */
  round2Groups: number
  /** 3차 조 수(각 조 1·2위 직행, 3·4위 4차행) */
  round3Groups: number
  /** 4차 조 수(각 조 1위 직행, 2위 5차행) */
  round4Groups: number
  doubleRound: boolean
}

/** CONCACAF 다라운드(A4): 1차(하위 녹아웃) → 2차 조 → 최종 조. */
export interface ConcacafFormat {
  kind: 'concacaf'
  /** 2차 예선 조 수(각 4팀, 1·2위 최종행). 최종 라운드 진입 팀 수 = round2Groups × 2. */
  round2Groups: number
  /** 최종 라운드 조 수(각 조 1위 직행, 최고 2위들 PO) */
  finalGroups: number
}

export type QualFormat = GroupsFormat | AfcFormat | ConcacafFormat

export const QUAL_FORMAT: Record<Confederation, QualFormat> = {
  // 실제 2026 예선처럼 UEFA 12개 조(A1), CAF 9개 조(A2). 전 대륙 홈&어웨이(A5).
  UEFA: { kind: 'groups', numGroups: 12, doubleRound: true },
  CAF: { kind: 'groups', numGroups: 9, doubleRound: true },
  CONMEBOL: { kind: 'groups', numGroups: 1, doubleRound: true },
  OFC: { kind: 'groups', numGroups: 1, doubleRound: true },
  // 다단계 대륙(A3·A4). AFC: 1차(하위 단판 녹아웃) → 2차(9개 조×4팀) → 3차(3개 조×6팀) → 4차 → 5차.
  AFC: { kind: 'afc', round2Groups: 9, round3Groups: 3, round4Groups: 2, doubleRound: true },
  // CONCACAF: 1차(하위 단판 녹아웃) → 2차 6개 조(4팀) → 최종 3개 조(4팀=12팀).
  CONCACAF: { kind: 'concacaf', round2Groups: 6, finalGroups: 3 },
}

/** 조 표시용 알파벳(A~L). 다단계 스테이지 라벨 생성에 쓴다. */
export const GROUP_LETTERS = 'ABCDEFGHIJKL'.split('')
