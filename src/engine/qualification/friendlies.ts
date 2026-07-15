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
 * - 매칭: FIFA 랭킹순으로 정렬해 인접한 두 팀을 짝짓되, 두 팀의 랭킹 차이가 50 이내일 때만 성사한다
 *   (전력 차가 크게 벌어진 국가끼리는 친선전을 잡지 않는다). 홀수로 남거나 격차가 크면 그 팀은 쉰다.
 * - 결과는 시드로 결정론적(재현 가능). 중립 경기로 보고 홈 이점은 두지 않는다.
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
    // 이 경기일에 쉬는 팀들을 랭킹순으로 정렬(인접 팀일수록 전력 차가 작다).
    const idle = [...pool].filter((t) => !busy.has(t)).sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b))

    // 인접 페어링: 랭킹 차 ≤ 50이면 성사, 아니면 앞 팀은 쉬고 한 칸 이동.
    let i = 0
    while (i < idle.length - 1) {
      const a = idle[i]
      const b = idle[i + 1]
      if (rankOf(b) - rankOf(a) <= MAX_RANK_GAP) {
        const ra = ratings[a]
        const rb = ratings[b]
        if (ra && rb) {
          const rand = createSeededRandom(`${seed}-FRIENDLY-${md}-${a}-${b}`)
          const s = simulateScoreRaw(ra, rb, 0, 0, rand) // 중립 평가전(홈 이점 없음)
          out.push({ matchday: md, homeTeamId: a, awayTeamId: b, homeGoals: s.homeGoals, awayGoals: s.awayGoals })
        }
        i += 2
      } else {
        i += 1
      }
    }
  }
  return out
}
