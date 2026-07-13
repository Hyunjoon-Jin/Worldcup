/**
 * 몬테카를로 표본 오차 (v2 #27). 확률 p(%)와 반복수 n으로부터 95% 신뢰구간의 오차범위를
 * 계산한다(비율의 표준오차 × 1.96). 추가 시뮬레이션 없이 결과의 불확실성을 표시할 수 있다.
 */
export function marginOfError95(pct: number, iterations: number): number {
  if (iterations <= 0) return 0
  const p = Math.min(1, Math.max(0, pct / 100))
  const se = Math.sqrt((p * (1 - p)) / iterations)
  return 1.96 * se * 100
}
