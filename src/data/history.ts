/**
 * 역대 FIFA 월드컵 우승 이력 (v2 #25). 사실 데이터(1930~2022 우승국).
 * 2026 본선 진출 48개국 중 과거 우승 경험이 있는 팀만 기재한다.
 */
export interface WorldCupHistory {
  titles: number
  years: number[]
}

export const WORLD_CUP_TITLES: Record<string, WorldCupHistory> = {
  BRA: { titles: 5, years: [1958, 1962, 1970, 1994, 2002] },
  GER: { titles: 4, years: [1954, 1974, 1990, 2014] },
  ARG: { titles: 3, years: [1978, 1986, 2022] },
  FRA: { titles: 2, years: [1998, 2018] },
  URU: { titles: 2, years: [1930, 1950] },
  ENG: { titles: 1, years: [1966] },
  ESP: { titles: 1, years: [2010] },
}

export function titlesFor(teamId: string): WorldCupHistory | null {
  return WORLD_CUP_TITLES[teamId] ?? null
}
