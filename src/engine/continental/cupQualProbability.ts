import type { CupFormat } from '../../data/continental/formats'
import type { Confederation, TeamRatings } from '../../types/team'
import { runCupQualification } from './cupQualification'
import { combinedCupDirectQualified } from './combinedQual'
import { simulateConfederation } from '../qualification/index'
import type { LockedLookup } from '../qualification/generic'
import { createSeededRandom } from '../rng'

/**
 * 대륙컵 지역예선 진출 확률(팀 ID → %). 월드컵 지역예선 확률 탭과 동형으로, 예선을 여러 번(시드 변주)
 * 시뮬레이션해 각 팀이 본선에 진출하는 빈도를 확률로 환산한다.
 * - 통합 예선(combinedWcq: 아시안컵 등): 그 대륙 월드컵 예선을 반복 시뮬레이션해 개최국(자동) +
 *   캠페인 상위 format.teams개국에 드는 빈도를 센다(같은 캠페인이므로 월드컵 예선을 재현).
 * - 그 외(조별리그·네이션스리그 등): runCupQualification을 반복해 진출국 빈도를 센다.
 * 결과는 결정론적(시드 기반)이다.
 */
export function computeCupQualProbabilities(
  format: CupFormat,
  ratings: Record<string, TeamRatings>,
  hostIds: string[],
  iterations: number,
  seedBase: string,
  opts?: { rankByTeam?: Record<string, number>; locked?: LockedLookup; cupHostIds?: string[] },
): Record<string, number> {
  const counts: Record<string, number> = {}
  const bump = (ids: string[]) => {
    for (const id of ids) counts[id] = (counts[id] ?? 0) + 1
  }

  if (format.qual.style === 'combinedWcq') {
    const confed = format.confeds[0] as Confederation
    // 대륙컵 개최국(자동 진출) — 월드컵 개최국(hostIds)과 다른 개념이므로 별도로 받는다.
    const cupHosts = opts?.cupHostIds ?? []
    for (let i = 0; i < iterations; i++) {
      // locked(치른 경기 고정) + 캠페인 반영 전력으로 조건부 시뮬레이션 → 이미 확정된 팀은 100%, 탈락은 0%로 수렴.
      const r = simulateConfederation(confed, ratings, createSeededRandom(`${seedBase}-${i}`), opts?.locked, hostIds)
      // 실제 규칙 반영: 대륙컵 개최국(자동) + 대륙컵 직행 자격 확보 팀(월드컵 2차 예선 통과 = 3차 예선 도달) 우선,
      // 남은 자리는 캠페인 순위(standings) 순으로 채워 format.teams까지.
      const direct = combinedCupDirectQualified(r)
      const hostSet = new Set(cupHosts.filter((h) => r.standings.includes(h)))
      const field: string[] = [...hostSet]
      const picked = new Set(field)
      for (const id of r.standings) {
        if (field.length >= format.teams) break
        if (!picked.has(id) && direct.has(id)) { field.push(id); picked.add(id) }
      }
      for (const id of r.standings) {
        if (field.length >= format.teams) break
        if (!picked.has(id)) { field.push(id); picked.add(id) }
      }
      bump(field.slice(0, format.teams))
    }
  } else {
    for (let i = 0; i < iterations; i++) {
      const q = runCupQualification(format, ratings, hostIds, `${seedBase}-${i}`, opts?.rankByTeam ?? {})
      bump(q.qualified)
    }
  }

  const out: Record<string, number> = {}
  for (const id of Object.keys(counts)) out[id] = (counts[id] / iterations) * 100
  return out
}
