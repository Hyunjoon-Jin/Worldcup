import type { TeamProbabilities } from '../../types/simulation'

export type NumericKey = Exclude<keyof TeamProbabilities, 'teamId'>

export const STAGES: { key: NumericKey; label: string; color: string }[] = [
  { key: 'groupStagePct', label: '32강', color: '#6da7ec' },
  { key: 'r16Pct', label: '16강', color: '#5598e7' },
  { key: 'qfPct', label: '8강', color: '#3987e5' },
  { key: 'sfPct', label: '4강', color: '#2a78d6' },
  { key: 'finalPct', label: '결승', color: '#256abf' },
  { key: 'championPct', label: '우승', color: '#1c5cab' },
]

/** 진출 확률 체인의 첫 단계(본선 진출) — 예선 진출 확률에서 온다. 위 STAGES 앞에 붙는다. */
export const QUALIFY_STAGE = { key: 'qualifyPct' as const, label: '본선진출', color: '#34d399' }
