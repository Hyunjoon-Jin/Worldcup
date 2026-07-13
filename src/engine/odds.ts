/**
 * 확률(%) → 배당률 변환 (v2 #29).
 * 확률을 유럽식(소수) / 미국식(머니라인) 배당으로 표기해 승부 예상을 다른 관점으로 보여준다.
 */

/** 유럽식 소수 배당(decimal odds). 예: 40% → 2.50. */
export function toDecimalOdds(pct: number): number | null {
  if (pct <= 0) return null
  return 100 / pct
}

/** 미국식 머니라인 배당. 예: 40% → +150, 60% → -150. */
export function toAmericanOdds(pct: number): number | null {
  if (pct <= 0 || pct >= 100) return null
  return pct >= 50 ? -Math.round((pct / (100 - pct)) * 100) : Math.round(((100 - pct) / pct) * 100)
}

export function formatDecimalOdds(pct: number): string {
  const d = toDecimalOdds(pct)
  return d == null ? '-' : `${d.toFixed(2)}배`
}

export function formatAmericanOdds(pct: number): string {
  const a = toAmericanOdds(pct)
  if (a == null) return '-'
  return a > 0 ? `+${a}` : `${a}`
}
