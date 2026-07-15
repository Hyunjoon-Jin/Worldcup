import { SLOT_ALLOCATION } from '../../data/confederations'
import { QUAL_FORMAT } from './formats'
import type { Confederation } from '../../types/team'
import type { QualificationResult } from '../../types/qualification'

/** 한 예선 스테이지(라운드)의 룰 설명. */
export interface QualStageRule {
  /** 스테이지 이름 (예: "2차 예선", "조별리그", "플레이오프") */
  name: string
  /** 진행 방식 (예: "9개 조 × 4팀 홈&어웨이") */
  format: string
  /** 진출/탈락 규칙 (예: "각 조 1·2위가 3차 진출") */
  advance: string
}

/** 한 대륙 예선의 전체 룰. */
export interface QualRule {
  confederation: Confederation
  /** 한 줄 요약 */
  summary: string
  /** 슬롯 요약 (예: "본선 직행 16장") */
  slots: string
  /** 스테이지별 상세 룰 */
  stages: QualStageRule[]
  /** 참고 사항 */
  note?: string
}

const UEFA = QUAL_FORMAT.UEFA
const CAF = QUAL_FORMAT.CAF
const AFC = QUAL_FORMAT.AFC
const CCF = QUAL_FORMAT.CONCACAF
const S = SLOT_ALLOCATION

/**
 * 대륙별 예선 룰 설명 (실제 시뮬레이션 엔진 동작과 일치). 포맷 숫자는 QUAL_FORMAT·SLOT_ALLOCATION에서
 * 가져와 규정이 바뀌면 자동으로 반영된다. UI(룰 패널)에서 "각 예선별 룰을 제대로" 안내하는 데 쓴다.
 */
export const QUAL_RULES: Record<Confederation, QualRule> = {
  UEFA: {
    confederation: 'UEFA',
    summary: `${UEFA.kind === 'groups' ? UEFA.numGroups : 12}개 조 리그 후 조 1위 직행, 나머지는 플레이오프로.`,
    slots: `본선 직행 ${S.UEFA.direct}장 (대륙간 PO 없음)`,
    stages: [
      {
        name: '조별리그',
        format: `${UEFA.kind === 'groups' ? UEFA.numGroups : 12}개 조 (조당 4~5팀) 홈&어웨이`,
        advance: '각 조 1위 본선 직행 (12장)',
      },
      {
        name: '플레이오프',
        format: '조 2위 12팀 + 조별 성적 최고 3위 4팀 = 16팀, 4개 경로로 준결승·결승 단판 녹아웃',
        advance: '각 경로 승자 본선 직행 (4장)',
      },
    ],
    note: '실제 규정의 플레이오프 4장 중 일부는 네이션스리그 경로로 배정되나, 본 시뮬은 조별 성적 최고 3위 4팀으로 대체한다.',
  },
  CAF: {
    confederation: 'CAF',
    summary: `${CAF.kind === 'groups' ? CAF.numGroups : 9}개 조 리그. 조 1위 직행, 최고 2위 4팀은 미니토너먼트로 대륙간 PO 1장을 다툰다.`,
    slots: `본선 직행 ${S.CAF.direct}장 + 대륙간 PO ${S.CAF.playoff}장`,
    stages: [
      {
        name: '조별리그',
        format: `${CAF.kind === 'groups' ? CAF.numGroups : 9}개 조 홈&어웨이`,
        advance: `각 조 1위 본선 직행 (${S.CAF.direct}장)`,
      },
      {
        name: '최고 2위 PO',
        format: '조 2위 중 성적 최고 4팀이 준결승·결승 단판 녹아웃(중립지)',
        advance: `우승 1팀이 대륙간 플레이오프행 (${S.CAF.playoff}장)`,
      },
    ],
  },
  AFC: {
    confederation: 'AFC',
    summary: '5단계 예선 — 1·2차 예비예선부터 3·4차 조별, 5차 2연전까지.',
    slots: `본선 직행 ${S.AFC.direct}장 + 대륙간 PO ${S.AFC.playoff}장`,
    stages: [
      { name: '1차 예선', format: '하위 팀 단판 녹아웃', advance: `승자가 2차 진출 (필드를 ${AFC.kind === 'afc' ? AFC.round2Groups * 4 : 36}팀으로 축소)` },
      { name: '2차 예선', format: `${AFC.kind === 'afc' ? AFC.round2Groups : 9}개 조 × 4팀 홈&어웨이`, advance: '각 조 1·2위가 3차 진출' },
      { name: '3차 예선', format: `${AFC.kind === 'afc' ? AFC.round3Groups : 3}개 조 × 6팀 홈&어웨이`, advance: `각 조 1·2위 본선 직행 (6장), 3·4위는 4차행` },
      { name: '4차 예선', format: `${AFC.kind === 'afc' ? AFC.round4Groups : 2}개 조 단판 라운드로빈(중립지)`, advance: '각 조 1위 본선 직행 (누적 8장), 2위는 5차행' },
      { name: '5차 예선', format: '두 조 2위 홈&어웨이 2연전(합산)', advance: `승자가 대륙간 플레이오프행 (${S.AFC.playoff}장)` },
    ],
  },
  CONMEBOL: {
    confederation: 'CONMEBOL',
    summary: '10개국 단일 리그(풀리그) 홈&어웨이 18라운드.',
    slots: `본선 직행 ${S.CONMEBOL.direct}장 + 대륙간 PO ${S.CONMEBOL.playoff}장`,
    stages: [
      {
        name: '단일 리그',
        format: '10개국 풀리그 홈&어웨이 (팀당 18경기)',
        advance: `상위 ${S.CONMEBOL.direct}위 본선 직행, ${S.CONMEBOL.direct + 1}위는 대륙간 PO`,
      },
    ],
  },
  CONCACAF: {
    confederation: 'CONCACAF',
    summary: '개최 3국 자동 진출 + 1·2차 예비예선 후 최종 3개 조.',
    slots: `본선 직행 ${S.CONCACAF.direct}장 (개최 3국 포함) + 대륙간 PO ${S.CONCACAF.playoff}장`,
    stages: [
      { name: '1차 예선', format: '하위 팀 단판 녹아웃', advance: `승자가 2차 진출 (필드를 ${CCF.kind === 'concacaf' ? CCF.round2Groups * 4 : 24}팀으로 축소)` },
      { name: '2차 예선', format: `${CCF.kind === 'concacaf' ? CCF.round2Groups : 6}개 조 × 4팀 홈&어웨이`, advance: '각 조 1·2위가 최종 라운드 진출' },
      { name: '최종 라운드', format: `${CCF.kind === 'concacaf' ? CCF.finalGroups : 3}개 조 × 4팀 홈&어웨이`, advance: `각 조 1위 본선 직행(개최국 제외 3장), 최고 2위 2팀은 대륙간 PO(${S.CONCACAF.playoff}장)` },
    ],
    note: '개최국(미국·멕시코·캐나다)은 예선 없이 자동 진출하며, 개최국을 뺀 나머지 국가끼리 위 예선을 치른다.',
  },
  OFC: {
    confederation: 'OFC',
    summary: '2개 조 리그 후 녹아웃. 결승 승자 직행, 결승 패자 대륙간 PO.',
    slots: `본선 직행 ${S.OFC.direct}장 + 대륙간 PO ${S.OFC.playoff}장`,
    stages: [
      {
        name: '조별리그',
        format: '2개 조 홈&어웨이',
        advance: '각 조 1·2위가 준결승 진출',
      },
      {
        name: '녹아웃',
        format: '준결승(A1-B2·B1-A2) → 결승, 모두 단판',
        advance: `결승 승자 본선 직행 (${S.OFC.direct}장), 결승 패자 대륙간 플레이오프행 (${S.OFC.playoff}장)`,
      },
    ],
  },
}

/** 대륙간 플레이오프 룰(6개 대륙 PO팀 → 2장). */
export const INTER_CONFED_RULE = {
  summary: '6개 대륙 플레이오프 대표 → 본선 2장',
  detail:
    '랭킹 상위 2팀은 결승에 직행(부전승), 나머지 4팀이 준결승을 치른다. 준결승 승자가 시드팀과 결승을 벌여, 2명의 결승 승자가 본선에 진출한다.',
} as const

/** 한 예선 스테이지의 진행 구간(라운드 범위). 진행현황 타임라인에 쓴다. */
export interface QualStageProgress {
  /** 스테이지 표시 이름 */
  name: string
  /** 시작 라운드(matchday) */
  startMd: number
  /** 종료 라운드(matchday) */
  endMd: number
  /** 이 스테이지에 속한 조 인덱스들 */
  groupIndices: number[]
}

/** 조 인덱스가 속한 스테이지 이름. 확률 집계·표시에서 조→차수 매핑에 쓴다(매치데이 계산 없이 가볍게). */
export function stageNameOfGroup(r: QualificationResult, gi: number): string {
  return stageNameFromLabel(r.groupLabels?.[gi], r.groups.length <= 1)
}

/**
 * 이 조가 리그(라운드로빈)가 아니라 녹아웃(브래킷/2연전)인지 판정한다. 녹아웃 조는 순위표가 아니라
 * 대진표로 표시해야 한다. 라벨 기준: '녹아웃', 'PO'(플레이오프·최고2위PO·UEFA 경로), '2연전'(2-leg).
 */
export function isKnockoutGroup(r: QualificationResult, gi: number): boolean {
  const label = r.groupLabels?.[gi] ?? ''
  return /녹아웃|PO|2연전|플레이오프/.test(label)
}

/** 결과에서 스테이지 이름 순서(조 인덱스 등장 순 = 차수 순). deriveQualStages보다 가볍다. */
export function stageOrderOfResult(r: QualificationResult): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  r.groups.forEach((_, gi) => {
    const name = stageNameOfGroup(r, gi)
    if (!seen.has(name)) {
      seen.add(name)
      order.push(name)
    }
  })
  return order
}

/** 조 라벨에서 스테이지 이름을 뽑는다("2차 A조"→"2차 예선", "PO 경로 A"→"플레이오프", "A조"→"조별리그"). */
function stageNameFromLabel(label: string | undefined, single: boolean): string {
  if (!label) return single ? '단일 리그' : '조별리그'
  const staged = label.match(/^(\d+)차/)
  if (staged) return `${staged[1]}차 예선`
  if (label.startsWith('최종')) return '최종 라운드'
  if (label.startsWith('녹아웃')) return '녹아웃'
  if (label.startsWith('PO') || label.includes('PO')) return '플레이오프'
  return '조별리그'
}

/**
 * 예선 결과에서 스테이지별 진행 구간을 도출한다(월드컵급 진행현황 타임라인용).
 * 조 라벨로 스테이지를 묶고, 각 스테이지가 걸치는 라운드(matchday) 범위를 계산해 시작 순으로 정렬한다.
 */
export function deriveQualStages(r: QualificationResult): QualStageProgress[] {
  const single = r.groups.length <= 1
  const byStage = new Map<string, { startMd: number; endMd: number; groupIndices: Set<number> }>()
  for (const m of r.matches) {
    const name = stageNameFromLabel(r.groupLabels?.[m.group], single)
    const s = byStage.get(name)
    if (s) {
      s.startMd = Math.min(s.startMd, m.matchday)
      s.endMd = Math.max(s.endMd, m.matchday)
      s.groupIndices.add(m.group)
    } else {
      byStage.set(name, { startMd: m.matchday, endMd: m.matchday, groupIndices: new Set([m.group]) })
    }
  }
  return [...byStage.entries()]
    .map(([name, s]) => ({ name, startMd: s.startMd, endMd: s.endMd, groupIndices: [...s.groupIndices].sort((a, b) => a - b) }))
    .sort((a, b) => a.startMd - b.startMd || a.endMd - b.endMd)
}

/** 특정 라운드(matchday)가 속한 스테이지 이름을 돌려준다(일별 일정에 "2차 예선 · R3" 표기용). */
export function stageNameAt(stages: QualStageProgress[], matchday: number): string | null {
  const s = stages.find((st) => matchday >= st.startMd && matchday <= st.endMd)
  return s ? s.name : null
}

/** 스테이지 진행 상태 — 완료/진행 중/예정. */
export type StageStatus = 'done' | 'active' | 'upcoming'

/** 현재 공개 라운드(revealed) 기준 스테이지 상태를 판정한다. */
export function stageStatus(stage: QualStageProgress, revealed: number): StageStatus {
  if (revealed >= stage.endMd) return 'done'
  if (revealed >= stage.startMd) return 'active'
  return 'upcoming'
}
