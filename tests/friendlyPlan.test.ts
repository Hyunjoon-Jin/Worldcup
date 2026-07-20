import { describe, it, expect } from 'vitest'
import { simulateAllQualification } from '../src/engine/qualification'
import { buildFriendlies, type FriendlyPlan } from '../src/engine/qualification/friendlies'
import { baseRatingsMap } from '../src/data/nations'
import { ALL_NATIONS } from '../src/data/nations'

const SEED = 'FRIENDLY-PLAN-TEST'
const ratings = baseRatingsMap(ALL_NATIONS.map((t) => t.id))
const result = simulateAllQualification(SEED, ratings)

/** 특정 경기일에 예선 경기가 없는(쉬는) 팀 두 곳을 찾아 반환한다. */
function twoFreeTeams(md: number): [string, string] {
  const pool = new Set<string>()
  const busy = new Set<string>()
  for (const r of Object.values(result.byConfederation)) {
    for (const m of r.matches) {
      pool.add(m.homeTeamId)
      pool.add(m.awayTeamId)
      if (m.matchday === md) {
        busy.add(m.homeTeamId)
        busy.add(m.awayTeamId)
      }
    }
  }
  const free = [...pool].filter((t) => !busy.has(t)).sort()
  return [free[0], free[1]]
}

describe('평가전 상대 편성(감독)', () => {
  const md = 2
  const [me, opp] = twoFreeTeams(md)

  it('편성한 상대와 그 경기일에 실제로 맞붙는다(planned 표시)', () => {
    const plan: FriendlyPlan = { teamId: me, byMatchday: { [md]: opp } }
    const friendlies = buildFriendlies(result, ratings, SEED, plan)
    const mine = friendlies.find((f) => f.matchday === md && (f.homeTeamId === me || f.awayTeamId === me))
    expect(mine).toBeTruthy()
    expect(mine!.planned).toBe(true)
    const ids = [mine!.homeTeamId, mine!.awayTeamId].sort()
    expect(ids).toEqual([me, opp].sort())
  })

  it('편성이 없으면 planned 평가전이 생기지 않는다', () => {
    const friendlies = buildFriendlies(result, ratings, SEED)
    expect(friendlies.some((f) => f.planned)).toBe(false)
  })

  it('편성은 결정론적이다(같은 입력→같은 결과)', () => {
    const plan: FriendlyPlan = { teamId: me, byMatchday: { [md]: opp } }
    const a = buildFriendlies(result, ratings, SEED, plan).find((f) => f.matchday === md && f.planned)!
    const b = buildFriendlies(result, ratings, SEED, plan).find((f) => f.matchday === md && f.planned)!
    expect(a.homeGoals).toBe(b.homeGoals)
    expect(a.awayGoals).toBe(b.awayGoals)
  })

  it('상대가 그 경기일에 예선 경기가 있으면(바쁨) 편성되지 않는다', () => {
    // md에 예선 경기를 치르는 팀을 하나 찾는다.
    let busyTeam = ''
    for (const r of Object.values(result.byConfederation)) {
      const m = r.matches.find((x) => x.matchday === md)
      if (m) {
        busyTeam = m.homeTeamId
        break
      }
    }
    expect(busyTeam).toBeTruthy()
    const plan: FriendlyPlan = { teamId: me, byMatchday: { [md]: busyTeam } }
    const friendlies = buildFriendlies(result, ratings, SEED, plan)
    // 지정 상대가 바빠서 planned 페어링이 성사되지 않아야 한다.
    const planned = friendlies.find((f) => f.matchday === md && f.planned)
    expect(planned).toBeFalsy()
  })
})
