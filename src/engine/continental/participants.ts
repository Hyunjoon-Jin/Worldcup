import { nationsByConfederation, ALL_NATIONS_BY_ID } from '../../data/nations'
import type { CupFormat } from '../../data/continental/formats'

/**
 * 대륙컵 참가국 필드 선정(길이 = format.teams). 개최국 우선, 그다음 '주 연맹'(confeds[0]) 소속국을
 * 랭킹순으로, 마지막으로 초청 연맹(코파의 CONCACAF 등) 소속국을 랭킹순으로 채운다.
 * - 단일 연맹 대회: 주 연맹에서 랭킹 상위 teams개(개최국 포함).
 * - 코파: 주 연맹 CONMEBOL 전원(10) + 초청 CONCACAF 상위로 16 채움.
 * rankByTeam(실시간 FIFA 순위, 작을수록 강함)이 있으면 그 순위를, 없으면 정적 근사 순위를 쓴다.
 */
export function selectCupParticipants(
  format: CupFormat,
  rankByTeam: Record<string, number> = {},
  hostIds: string[] = [],
): string[] {
  const rankOf = (id: string) => rankByTeam[id] ?? ALL_NATIONS_BY_ID[id]?.fifaRankApprox ?? 999
  const [primary, ...guests] = format.confeds

  const primaryPool = new Set(nationsByConfederation(primary).map((t) => t.id))
  const guestPool = new Set(guests.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))

  // 개최국은 소속 풀(주/초청)에 실재하는 것만 인정.
  const hosts = hostIds.filter((h) => primaryPool.has(h) || guestPool.has(h))
  const hostSet = new Set(hosts)

  const byRank = (ids: string[]) => ids.filter((id) => !hostSet.has(id)).sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b))

  const primarySorted = byRank([...primaryPool])
  const guestSorted = byRank([...guestPool])

  const field = [...hosts, ...primarySorted, ...guestSorted].slice(0, format.teams)
  return field
}
