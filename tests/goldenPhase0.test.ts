import { describe, expect, it } from 'vitest'
import { simulateAllQualification } from '../src/engine/qualification'
import { baseRatingsMap, ALL_NATIONS } from '../src/data/nations'
import { buildQualCalendar } from '../src/engine/qualification/calendar'
import { buildFriendlies } from '../src/engine/qualification/friendlies'
import { buildFullSchedule } from '../src/engine/scheduleEngine'
import { collectPlayedByConfed, flattenPlayed } from '../src/engine/qualification/conditional'
import { computeLiveRanking } from '../src/engine/qualification/ranking'

/**
 * Phase 0 골든(특성화) 테스트 — 대륙별 대회 추가를 위한 토대 리팩터가 기존 동작을 바꾸지 않음을 강제한다.
 * 예선 캘린더·친선전·본선 일정·라이브 랭킹의 결정론적 출력을 스냅샷으로 고정한다. 리팩터 후에도 이 스냅샷이
 * 그대로 유지돼야 한다(대륙컵 비활성·기준 대회(2026·기본 개최국) 기준 바이트 동일).
 */
const SEED = 'GOLDEN-PHASE0'
const ratings = baseRatingsMap(ALL_NATIONS.map((t) => t.id))
const result = simulateAllQualification(SEED, ratings) // 기본 개최국·기본 랭킹

describe('Phase 0 골든: 예선 캘린더', () => {
  it('경기일(날짜·윈도우·공개 라운드) 결정론적', () => {
    const cal = buildQualCalendar(result, 2026)
    const sig = cal.map((d) => `${d.windowIndex}|${d.date}|${d.matches.length}`).join('\n')
    expect(sig).toMatchSnapshot()
  })
})

describe('Phase 0 골든: 친선전(평가전)', () => {
  it('편성·결과 결정론적', () => {
    const friendlies = buildFriendlies(result, ratings, SEED)
    const sig = friendlies.map((f) => `${f.matchday}|${f.homeTeamId}-${f.awayTeamId}|${f.homeGoals}:${f.awayGoals}`).join('\n')
    expect(sig).toMatchSnapshot()
  })
})

describe('Phase 0 골든: 본선 일정(월드컵)', () => {
  it('조별·녹아웃 날짜 결정론적', () => {
    const sched = buildFullSchedule()
    const grp = sched.groupMatches.map((m) => `${m.day}|${m.date}|${m.group}`).join('\n')
    const ko = sched.knockoutMatches.map((m) => `${m.round}|${m.date ?? ''}`).join('\n')
    expect(`GROUP\n${grp}\nKO\n${ko}\ndays=${sched.totalGroupStageDays}`).toMatchSnapshot()
  })
})

describe('Phase 0 골든: 라이브 FIFA 랭킹(예선 전체 반영)', () => {
  it('순위·점수 결정론적', () => {
    const fullRevealed = Object.fromEntries(
      Object.entries(result.byConfederation).map(([c, r]) => [c, r.matchdays]),
    )
    const played = flattenPlayed(collectPlayedByConfed(result, fullRevealed))
    const globalRevealed = Math.max(0, ...Object.values(fullRevealed))
    const friendlies = buildFriendlies(result, ratings, SEED).filter((f) => f.matchday <= globalRevealed)
    const rows = computeLiveRanking(result, played, undefined, undefined, friendlies)
    const sig = rows.map((r) => `${r.rank}|${r.teamId}|${r.points}`).join('\n')
    expect(sig).toMatchSnapshot()
  })
})
