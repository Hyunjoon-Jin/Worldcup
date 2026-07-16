import type { Confederation } from '../../types/team'
import type { KnockoutRound } from '../../types/match'

/**
 * 대륙별 대표 대회(컨티넨탈 챔피언십) 포맷 선언. 조사 문서(docs/대륙대회-규정조사.md·-일정조사.md)의
 * 확정 수치를 그대로 인코딩한다. 이 테이블 하나로 대회별 차이(팀수·조편성·최고3위·3위전·연장·타이브레이커·
 * 개최월·예선)를 표현해, 엔진/UI가 대회 종류로 분기하지 않고 데이터로 동작하게 한다(순수 데이터, 부작용 없음).
 */
export type CupId = 'EURO' | 'COPA' | 'AFCON' | 'ASIAN' | 'GOLD' | 'OFC'

/** 조별 타이브레이커 방식. UEFA·CAF·AFC=상대전적 우선(h2h), CONMEBOL·CONCACAF·OFC=전체 득실 우선(overall). */
export type GroupTiebreak = 'h2h' | 'overall'

/** 녹아웃 연장 규정. all=전 라운드 연장 후 PK, finalOnly=결승만 연장(그 외 즉시 PK). */
export type ExtraTimeRule = 'all' | 'finalOnly'

/** 본선 개최 시기 유형(일정 배치용). */
export type MonthWindow = 'summer' | 'january' | 'winterAfcon'

/** 예선 방식 유형(대륙대회-예선규정조사 §0). */
export type QualStyle = 'groupsPlusPlayoff' | 'groups' | 'combinedWcq' | 'nationsLeague' | 'guestsInvite' | 'prelimSingle'

export interface CupSchedule {
  /** 개최 시기 유형 */
  monthWindow: MonthWindow
  /** 조별 매치데이(MD1·MD2·MD3)의 개막일 대비 오프셋(일). Day 1 = 개막. */
  groupDayOffsets: number[]
  /** 녹아웃 라운드별 개막일 대비 오프셋(일). */
  knockoutDayOffsets: Partial<Record<KnockoutRound, number>>
  /** 대회 총 일수(개막~결승). */
  totalDays: number
}

export interface CupQual {
  /** 본선 총 티켓 수(개최국 포함). teams와 동일. */
  slots: number
  /** 개최국 자동 진출 수. */
  hostSlots: number
  /** 예선 방식. */
  style: QualStyle
  /** 예선 캘린더 윈도우(매치데이) 수 근사. */
  matchdays: number
}

export interface CupFormat {
  id: CupId
  nameKo: string
  /** 참가 연맹(코파=CONMEBOL + CONCACAF 초청). */
  confeds: Confederation[]
  /** 본선 팀 수. */
  teams: number
  /** 조 수. */
  groups: number
  /** 조당 팀 수. */
  teamsPerGroup: number
  /** 조별 직행 진출(조당). */
  advancePerGroup: number
  /** 최고 3위 진출 수(24팀 대회=4, 그 외=0). */
  bestThirds: number
  /** 녹아웃 라운드 순서(첫 라운드가 진입 규모를 정한다: R16=16팀, QF=8팀, SF=4팀). */
  knockout: KnockoutRound[]
  /** 3·4위전 유무. */
  thirdPlace: boolean
  /** 연장 규정. */
  extraTime: ExtraTimeRule
  /** 조별 타이브레이커 방식. */
  groupTiebreak: GroupTiebreak
  /** 개최국 자동 진출 여부(전 대회 true). */
  hostAutoQualify: boolean
  schedule: CupSchedule
  qual: CupQual
}

export const CUP_FORMATS: Record<CupId, CupFormat> = {
  EURO: {
    id: 'EURO',
    nameKo: '유럽 축구 선수권',
    confeds: ['UEFA'],
    teams: 24,
    groups: 6,
    teamsPerGroup: 4,
    advancePerGroup: 2,
    bestThirds: 4,
    knockout: ['R16', 'QF', 'SF', 'FINAL'],
    thirdPlace: false,
    extraTime: 'all',
    groupTiebreak: 'h2h',
    hostAutoQualify: true,
    schedule: { monthWindow: 'summer', groupDayOffsets: [1, 6, 10], knockoutDayOffsets: { R16: 16, QF: 22, SF: 26, FINAL: 31 }, totalDays: 31 },
    qual: { slots: 24, hostSlots: 1, style: 'groupsPlusPlayoff', matchdays: 10 },
  },
  COPA: {
    id: 'COPA',
    nameKo: '코파 아메리카',
    confeds: ['CONMEBOL', 'CONCACAF'],
    teams: 16,
    groups: 4,
    teamsPerGroup: 4,
    advancePerGroup: 2,
    bestThirds: 0,
    knockout: ['QF', 'SF', 'FINAL'],
    thirdPlace: true,
    extraTime: 'finalOnly',
    groupTiebreak: 'overall',
    hostAutoQualify: true,
    schedule: { monthWindow: 'summer', groupDayOffsets: [1, 5, 9], knockoutDayOffsets: { QF: 15, SF: 20, THIRD: 24, FINAL: 25 }, totalDays: 25 },
    qual: { slots: 16, hostSlots: 1, style: 'guestsInvite', matchdays: 0 },
  },
  AFCON: {
    id: 'AFCON',
    nameKo: '아프리카 네이션스컵',
    confeds: ['CAF'],
    teams: 24,
    groups: 6,
    teamsPerGroup: 4,
    advancePerGroup: 2,
    bestThirds: 4,
    knockout: ['R16', 'QF', 'SF', 'FINAL'],
    thirdPlace: true,
    extraTime: 'all',
    groupTiebreak: 'h2h',
    hostAutoQualify: true,
    schedule: { monthWindow: 'winterAfcon', groupDayOffsets: [1, 5, 8], knockoutDayOffsets: { R16: 14, QF: 20, SF: 25, THIRD: 28, FINAL: 29 }, totalDays: 29 },
    qual: { slots: 24, hostSlots: 1, style: 'groups', matchdays: 6 },
  },
  ASIAN: {
    id: 'ASIAN',
    nameKo: 'AFC 아시안컵',
    confeds: ['AFC'],
    teams: 24,
    groups: 6,
    teamsPerGroup: 4,
    advancePerGroup: 2,
    bestThirds: 4,
    knockout: ['R16', 'QF', 'SF', 'FINAL'],
    thirdPlace: false,
    extraTime: 'all',
    groupTiebreak: 'h2h',
    hostAutoQualify: true,
    schedule: { monthWindow: 'january', groupDayOffsets: [1, 6, 11], knockoutDayOffsets: { R16: 17, QF: 22, SF: 26, FINAL: 30 }, totalDays: 30 },
    qual: { slots: 24, hostSlots: 1, style: 'combinedWcq', matchdays: 6 },
  },
  GOLD: {
    id: 'GOLD',
    nameKo: 'CONCACAF 골드컵',
    confeds: ['CONCACAF'],
    teams: 16,
    groups: 4,
    teamsPerGroup: 4,
    advancePerGroup: 2,
    bestThirds: 0,
    knockout: ['QF', 'SF', 'FINAL'],
    thirdPlace: false,
    extraTime: 'finalOnly',
    groupTiebreak: 'overall',
    hostAutoQualify: true,
    schedule: { monthWindow: 'summer', groupDayOffsets: [1, 4, 9], knockoutDayOffsets: { QF: 15, SF: 19, FINAL: 23 }, totalDays: 23 },
    qual: { slots: 16, hostSlots: 1, style: 'nationsLeague', matchdays: 0 },
  },
  OFC: {
    id: 'OFC',
    nameKo: 'OFC 네이션스컵',
    confeds: ['OFC'],
    teams: 8,
    groups: 2,
    teamsPerGroup: 4,
    advancePerGroup: 2,
    bestThirds: 0,
    knockout: ['SF', 'FINAL'],
    thirdPlace: true,
    extraTime: 'all',
    groupTiebreak: 'overall',
    hostAutoQualify: true,
    schedule: { monthWindow: 'summer', groupDayOffsets: [1, 4, 7], knockoutDayOffsets: { SF: 13, THIRD: 16, FINAL: 16 }, totalDays: 16 },
    qual: { slots: 8, hostSlots: 1, style: 'prelimSingle', matchdays: 3 },
  },
}

export const ALL_CUP_IDS: CupId[] = ['EURO', 'COPA', 'AFCON', 'ASIAN', 'GOLD', 'OFC']

/** 첫 녹아웃 라운드에 진입하는 팀 수(= 조 직행 + 최고3위). R16=16, QF=8, SF=4와 일치해야 한다. */
export function knockoutEntrants(f: CupFormat): number {
  return f.groups * f.advancePerGroup + f.bestThirds
}
