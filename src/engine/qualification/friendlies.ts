import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { simulateScoreRaw } from '../matchCore'
import { createSeededRandom } from '../rng'
import type { AllQualificationResult } from './index'
import type { TeamRatings } from '../../types/team'

/** 지역예선 기간 중 열리는 친선전(평가전) 한 경기. matchday는 예선 경기일(라운드)과 동일 축을 쓴다. */
export interface FriendlyMatch {
  matchday: number
  homeTeamId: string
  awayTeamId: string
  homeGoals: number
  awayGoals: number
}

// 친선전은 전력 차가 큰 국가끼리는 잡지 않는다 — FIFA 랭킹 근사값 기준 최대 50위 차이까지만 성사.
const MAX_RANK_GAP = 50

const rankOf = (id: string) => ALL_NATIONS_BY_ID[id]?.fifaRankApprox ?? 999

/**
 * 각 예선 경기일마다 그 시기에 예선 경기가 없는 국가들끼리 친선전(평가전)을 편성해 시뮬레이션한다.
 * - 대상: 예선 참가국 전체 + 개최국(자동 진출로 예선을 치르지 않음). 그날 예선 경기가 있는 팀은 제외.
 * - 매칭: FIFA 랭킹순으로 정렬한 뒤, 가장 강한 미매칭 팀부터 랭킹 차 50 이내의 상대 후보 중 하나를
 *   경기일 시드로 '무작위' 선택해 짝짓는다. 이렇게 하면 매 윈도우마다 상대가 달라져(고정 인접 페어링과
 *   달리) 같은 팀하고만 계속 붙지 않는다. 랭킹 차가 큰 상대는 후보에서 제외돼 성사되지 않는다.
 * - 홈/원정도 시드로 번갈아 정해 표시가 한쪽으로 쏠리지 않게 한다(중립 경기라 결과엔 홈 이점 미적용).
 * - 결과는 시드로 결정론적(재현 가능).
 */
export function buildFriendlies(
  result: AllQualificationResult,
  ratings: Record<string, TeamRatings>,
  seed: string,
): FriendlyMatch[] {
  // 예선에 등장하는 모든 국가 + 개최국을 친선전 대상 풀로 삼는다.
  const pool = new Set<string>()
  let maxMatchday = 0
  for (const r of Object.values(result.byConfederation)) {
    for (const m of r.matches) {
      pool.add(m.homeTeamId)
      pool.add(m.awayTeamId)
      if (m.matchday > maxMatchday) maxMatchday = m.matchday
    }
  }
  for (const h of result.hosts) pool.add(h)

  const out: FriendlyMatch[] = []
  for (let md = 1; md <= maxMatchday; md++) {
    // 이 경기일에 예선 경기를 치르는(바쁜) 팀 집합.
    const busy = new Set<string>()
    for (const r of Object.values(result.byConfederation)) {
      for (const m of r.matches) {
        if (m.matchday === md) {
          busy.add(m.homeTeamId)
          busy.add(m.awayTeamId)
        }
      }
    }
    // 이 경기일에 쉬는 팀들을 랭킹순으로 정렬(인접할수록 전력 차가 작다).
    const remaining = [...pool].filter((t) => !busy.has(t)).sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b))
    // 페어링·홈원정 선택을 경기일마다 다르게 하는 시드 RNG(윈도우별 상대 다양화).
    const pairRng = createSeededRandom(`${seed}-FRIENDLY-PAIR-${md}`)

    while (remaining.length > 1) {
      const a = remaining.shift() as string // 가장 강한 미매칭 팀
      // 랭킹 차 ≤ 50인 상대 후보(정렬돼 있으므로 앞에서부터 연속 구간). 후보 중 하나를 무작위 선택.
      let candCount = 0
      while (candCount < remaining.length && rankOf(remaining[candCount]) - rankOf(a) <= MAX_RANK_GAP) candCount++
      if (candCount === 0) continue // 붙일 상대가 없으면 이 팀은 쉰다
      const pick = Math.floor(pairRng() * candCount)
      const b = remaining.splice(pick, 1)[0]
      const ra = ratings[a]
      const rb = ratings[b]
      if (!ra || !rb) continue
      // 홈/원정을 시드로 번갈아(중립이라 결과 영향은 없지만 표시 균형).
      const [homeId, awayId, homeR, awayR] = pairRng() < 0.5 ? [a, b, ra, rb] : [b, a, rb, ra]
      const rand = createSeededRandom(`${seed}-FRIENDLY-${md}-${homeId}-${awayId}`)
      const s = simulateScoreRaw(homeR, awayR, 0, 0, rand) // 중립 평가전(홈 이점 없음)
      out.push({ matchday: md, homeTeamId: homeId, awayTeamId: awayId, homeGoals: s.homeGoals, awayGoals: s.awayGoals })
    }
  }
  return out
}
