import type { TeamProbabilities } from '../../types/simulation'

export type NumericKey = Exclude<keyof TeamProbabilities, 'teamId'>

export const STAGES: { key: NumericKey; label: string; color: string }[] = [
  { key: 'groupStagePct', label: '조별통과', color: '#6da7ec' },
  { key: 'r16Pct', label: '16강', color: '#5598e7' },
  { key: 'qfPct', label: '8강', color: '#3987e5' },
  { key: 'sfPct', label: '4강', color: '#2a78d6' },
  { key: 'finalPct', label: '결승', color: '#256abf' },
  { key: 'championPct', label: '우승', color: '#1c5cab' },
]
