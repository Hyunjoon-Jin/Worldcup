/**
 * 데일리 챌린지 시드 (v2 #47). 날짜에서 결정론적 시드를 만들어, 같은 날에는 전 세계 누구나
 * 동일한 조추첨으로 시작하게 한다. 서버 없이 날짜만으로 공유 가능한 "오늘의 도전".
 */
export function dailySeedForDate(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `DAILY-${y}${m}${d}`
}

/** 표시용 라벨(예: "7월 12일 오늘의 도전"). */
export function dailyChallengeLabel(date: Date = new Date()): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 오늘의 도전`
}
