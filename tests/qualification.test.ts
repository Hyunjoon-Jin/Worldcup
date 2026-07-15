import { describe, expect, it } from 'vitest'
import { simulateConmebol } from '../src/engine/qualification/conmebol'
import { simulateAllQualification, simulateConfederation } from '../src/engine/qualification'
import { nationsByConfederation, baseRatingsMap, ALL_NATIONS, ALL_NATIONS_BY_ID } from '../src/data/nations'
import { resolveStyleBias } from '../src/data/teams'
import { SLOT_ALLOCATION } from '../src/data/confederations'
import { createSeededRandom } from '../src/engine/rng'
import { computePots, runSeededDraw } from '../src/engine/drawEngine'
import { createQualProbAccumulator } from '../src/engine/qualification/probability'
import { extractQualDrama } from '../src/engine/qualification/drama'
import { QUAL_FORMAT } from '../src/engine/qualification/formats'
import { computeQualStats, computeConfedDifficulty, computeLuckAnalysis, probMarginPct, computeQualHighlights } from '../src/engine/qualification/stats'
import { pickQualUpset } from '../src/engine/qualification/upset'
import { runWhatIfScenarios } from '../src/engine/qualification/whatif'
import { buildQualCalendar } from '../src/engine/qualification/calendar'
import { collectPlayedByConfed, buildLockedLookups, isPartialProgress } from '../src/engine/qualification/conditional'
import { rankAcrossGroups, roundRobinMatchdayCount, roundRobinSingleRounds } from '../src/engine/qualification/generic'
import type { QualMatch } from '../src/types/qualification'
import {
  basePointsFromRank,
  effectiveRankFromPoints,
  applyMatchElo,
  initRankingPoints,
  updateRankingPoints,
  computeRankingMovers,
  formOffsetsFromResults,
  expectedResult,
  computeLiveRanking,
  computeRankingTrend,
  overallDeltasFromResults,
  IMPORTANCE_QUALIFIER,
} from '../src/engine/qualification/ranking'
import { generateUpsetArticle } from '../src/engine/upsetArticle'
import type { Confederation } from '../src/types/team'

const conmebolIds = nationsByConfederation('CONMEBOL').map((t) => t.id)
const ratings = baseRatingsMap(conmebolIds)

describe('nations 레지스트리 (지역예선 Q1)', () => {
  it('CONMEBOL은 정확히 10개국', () => {
    expect(conmebolIds).toHaveLength(10)
  })
  it('본선 6국 + 비본선 4국이 모두 포함된다', () => {
    for (const id of ['ARG', 'BRA', 'URU', 'COL', 'ECU', 'PAR', 'CHI', 'PER', 'VEN', 'BOL']) {
      expect(conmebolIds).toContain(id)
    }
  })
  it('비본선 참가국도 능력치·랭킹이 있다', () => {
    expect(ALL_NATIONS_BY_ID.CHI.baseRatings.overall).toBeGreaterThan(0)
    expect(ALL_NATIONS_BY_ID.BOL.fifaRankApprox).toBe(58)
  })
})

describe('simulateConmebol (지역예선 Q2)', () => {
  it('슬롯 수를 정확히 지킨다: 6 직행 + 1 PO, 총 10팀 순위', () => {
    const r = simulateConmebol(ratings, createSeededRandom('conmebol-1'))
    expect(r.qualified).toHaveLength(SLOT_ALLOCATION.CONMEBOL.direct) // 6
    expect(r.playoff).toHaveLength(SLOT_ALLOCATION.CONMEBOL.playoff) // 1
    expect(r.standings).toHaveLength(10)
    // 직행 + PO + 탈락 = 10, 중복 없음
    expect(new Set(r.standings).size).toBe(10)
  })

  it('단일리그이므로 각 팀은 18경기(홈&어웨이 9상대)를 치른다', () => {
    const r = simulateConmebol(ratings, createSeededRandom('conmebol-2'))
    expect(r.matches).toHaveLength((10 * 9)) // 90경기(각 팀 18경기)
    const argMatches = r.matches.filter((m) => m.homeTeamId === 'ARG' || m.awayTeamId === 'ARG')
    expect(argMatches).toHaveLength(18)
  })

  it('같은 시드는 같은 예선 결과를 재현한다', () => {
    const a = simulateConmebol(ratings, createSeededRandom('same'))
    const b = simulateConmebol(ratings, createSeededRandom('same'))
    expect(a.standings).toEqual(b.standings)
  })

  it('여러 시드 평균에서 최강 아르헨티나의 직행률이 최약 볼리비아보다 높다', () => {
    let argQ = 0
    let bolQ = 0
    for (let s = 0; s < 40; s++) {
      const r = simulateConmebol(ratings, createSeededRandom(`agg-${s}`))
      if (r.qualified.includes('ARG')) argQ++
      if (r.qualified.includes('BOL')) bolQ++
    }
    expect(argQ).toBeGreaterThan(bolQ)
  })
})

describe('대륙별 예선 슬롯 정확성 (지역예선 Q2 확장)', () => {
  const allRatings = baseRatingsMap(ALL_NATIONS.map((t) => t.id))
  const cases: Array<[Confederation, number, number]> = [
    ['UEFA', 16, 0],
    ['CAF', 9, 1],
    ['AFC', 8, 1],
    ['CONMEBOL', 6, 1],
    ['OFC', 1, 1],
  ]
  for (const [confed, direct, playoff] of cases) {
    it(`${confed}: 직행 ${direct} + PO ${playoff}`, () => {
      const r = simulateConfederation(confed, allRatings, createSeededRandom(`${confed}-x`))
      expect(r.qualified).toHaveLength(direct)
      expect(r.playoff).toHaveLength(playoff)
    })
  }

  it('CONCACAF: 비개최국 시뮬은 직행 3 + PO 2 (개최 3국은 오케스트레이터에서 자동)', () => {
    const r = simulateConfederation('CONCACAF', allRatings, createSeededRandom('CCF'))
    expect(r.qualified).toHaveLength(SLOT_ALLOCATION.CONCACAF.direct - 3) // 3
    expect(r.playoff).toHaveLength(2)
    for (const host of ['MEX', 'USA', 'CAN']) expect(r.qualified).not.toContain(host)
  })
})

describe('예선 통계 대시보드 (개선 F5)', () => {
  it('리더보드는 실제 경기 누적과 일치하고 같은 시드는 재현된다', () => {
    const all = simulateAllQualification('STATS')
    const s = computeQualStats(all)
    expect(s.topScorers.length).toBeGreaterThan(0)
    expect(s.mostWins.length).toBeGreaterThan(0)
    expect(s.bestDefense.length).toBeGreaterThan(0)
    // 다득점 리더보드는 내림차순
    for (let i = 1; i < s.topScorers.length; i++) {
      expect(s.topScorers[i - 1].goalsFor).toBeGreaterThanOrEqual(s.topScorers[i].goalsFor)
    }
    // 최소 실점 리더보드는 오름차순(실점 적을수록 앞)
    for (let i = 1; i < s.bestDefense.length; i++) {
      expect(s.bestDefense[i - 1].goalsAgainst).toBeLessThanOrEqual(s.bestDefense[i].goalsAgainst)
    }
    // 최다 승 1위의 승수 = 전 팀 최대 승수
    const all2 = simulateAllQualification('STATS')
    const s2 = computeQualStats(all2)
    expect(s.mostWins[0].teamId).toBe(s2.mostWins[0].teamId)
    // 최다 점수차 경기는 실제 그 점수차를 갖는다
    if (s.biggestWin) {
      expect(Math.abs(s.biggestWin.match.homeGoals - s.biggestWin.match.awayGoals)).toBe(s.biggestWin.margin)
    }
  })

  it('한 팀의 경기 수 합은 played와 일치한다', () => {
    const all = simulateAllQualification('STATS2')
    const s = computeQualStats(all, 100)
    const arg = s.topScorers.concat(s.mostWins).find((t) => t.teamId === 'ARG')
    if (arg) expect(arg.played).toBe(arg.wins + arg.draws + arg.losses)
  })
})

describe('진출 확률 신뢰구간 (개선 G2)', () => {
  it('오차범위는 p=50%에서 최대, 0·100%에서 0이고 표본이 커지면 좁아진다', () => {
    expect(probMarginPct(0, 300)).toBe(0)
    expect(probMarginPct(100, 300)).toBe(0)
    // p=50%가 가장 큰 오차
    expect(probMarginPct(50, 300)).toBeGreaterThan(probMarginPct(20, 300))
    // 표본이 커지면 오차범위 감소
    expect(probMarginPct(50, 1200)).toBeLessThan(probMarginPct(50, 300))
    // n<=0 방어
    expect(probMarginPct(50, 0)).toBe(0)
  })
})

describe('조건부 확률 — 예선 실황 반영 (locked results)', () => {
  it('모든 조별 경기를 고정하면 대륙별 직행·PO가 그대로 재현된다(대륙간 PO만 재추첨)', () => {
    const all = simulateAllQualification('COND')
    // 전체 공개(=모든 조별 경기 치름)로 locked 구성
    const revealed = Object.fromEntries(
      Object.entries(all.byConfederation).map(([c, r]) => [c, r.matchdays]),
    )
    const played = collectPlayedByConfed(all, revealed)
    const lockedByConfed = buildLockedLookups(played)
    // 완전히 다른 시드로 돌려도 조별 경기는 고정이라 대륙별 결과가 동일해야 한다
    const redo = simulateAllQualification('DIFFERENT-SEED', undefined, lockedByConfed)
    for (const c of Object.keys(all.byConfederation)) {
      expect(redo.byConfederation[c].qualified).toEqual(all.byConfederation[c].qualified)
      expect(redo.byConfederation[c].playoff).toEqual(all.byConfederation[c].playoff)
    }
    // 대륙간 PO 참가 6팀도 동일(조별 결과가 고정이므로)
    expect(redo.interConfed.participants.sort()).toEqual(all.interConfed.participants.sort())
    // 개최국 + 대륙 직행(=대륙간 PO 승자 제외)은 동일
    const directOnly = (r: typeof all) =>
      r.qualified48.filter((id) => !r.interConfed.winners.includes(id)).sort()
    expect(directOnly(redo)).toEqual(directOnly(all))
  })

  it('부분 진행 판정과 치른 경기 수집이 공개 라운드를 따른다', () => {
    const all = simulateAllQualification('COND2')
    // UEFA만 절반 공개, 나머지는 전체
    const revealed: Record<string, number> = {}
    for (const c of Object.keys(all.byConfederation)) revealed[c] = all.byConfederation[c].matchdays
    revealed.UEFA = Math.floor(all.byConfederation.UEFA.matchdays / 2)
    expect(isPartialProgress(all, revealed)).toBe(true)
    const played = collectPlayedByConfed(all, revealed)
    // UEFA는 절반 이하 매치데이만
    expect(played.UEFA.every((m) => m.matchday <= revealed.UEFA)).toBe(true)
    // 전체 공개면 부분 진행 아님
    const full = Object.fromEntries(Object.entries(all.byConfederation).map(([c, r]) => [c, r.matchdays]))
    expect(isPartialProgress(all, full)).toBe(false)
  })

  it('부분 고정 + 남은 경기 시뮬: 고정된 경기 결과는 항상 보존된다', () => {
    const all = simulateAllQualification('COND3')
    const revealed: Record<string, number> = {}
    for (const c of Object.keys(all.byConfederation)) revealed[c] = Math.ceil(all.byConfederation[c].matchdays / 2)
    const played = collectPlayedByConfed(all, revealed)
    const lockedByConfed = buildLockedLookups(played)
    const redo = simulateAllQualification('OTHER', undefined, lockedByConfed)
    // 고정한 경기는 재시뮬 결과에서도 같은 스코어여야 한다
    for (const c of Object.keys(played)) {
      const redoMap = new Map(
        redo.byConfederation[c].matches.map((m) => [`${m.group}|${m.matchday}|${m.homeTeamId}|${m.awayTeamId}`, m]),
      )
      for (const lm of played[c]) {
        const rm = redoMap.get(`${lm.group}|${lm.matchday}|${lm.homeTeamId}|${lm.awayTeamId}`)
        expect(rm).toBeTruthy()
        expect(rm!.homeGoals).toBe(lm.homeGoals)
        expect(rm!.awayGoals).toBe(lm.awayGoals)
      }
    }
  })
})

describe('FIFA 랭킹 Elo 갱신 (월 단위 반영)', () => {
  it('랭킹↔점수 변환은 역함수 관계이고, 강팀이 더 높은 점수를 받는다', () => {
    expect(basePointsFromRank(1)).toBeGreaterThan(basePointsFromRank(50))
    // 역변환 근사
    expect(effectiveRankFromPoints(basePointsFromRank(20))).toBeCloseTo(20, 5)
  })

  it('승리 팀은 점수가 오르고 패배 팀은 내린다(합은 보존)', () => {
    const p = { A: 1500, B: 1500 }
    const before = p.A + p.B
    applyMatchElo(p, { homeTeamId: 'A', awayTeamId: 'B', homeGoals: 2, awayGoals: 0 })
    expect(p.A).toBeGreaterThan(1500)
    expect(p.B).toBeLessThan(1500)
    expect(p.A + p.B).toBeCloseTo(before, 6) // 제로섬
  })

  it('이변(약체 승)은 강팀 승보다 점수 변동이 크다', () => {
    const upset = { S: 1800, W: 1400 }
    applyMatchElo(upset, { homeTeamId: 'W', awayTeamId: 'S', homeGoals: 1, awayGoals: 0 }) // 약체 W 승
    const expected = { S: 1800, W: 1400 }
    applyMatchElo(expected, { homeTeamId: 'S', awayTeamId: 'W', homeGoals: 1, awayGoals: 0 }) // 강체 S 승
    expect(upset.W - 1400).toBeGreaterThan(expected.S - 1800)
  })

  it('진행된 경기로 랭킹 무버를 계산한다(승승승 팀은 상승)', () => {
    const all = simulateAllQualification('RANK')
    // CONMEBOL 단일리그에서 ARG의 승리 경기만 골라 적용 → 상승해야
    const argWins = all.byConfederation.CONMEBOL.matches.filter(
      (m) => (m.homeTeamId === 'ARG' && m.homeGoals > m.awayGoals) || (m.awayTeamId === 'ARG' && m.awayGoals > m.homeGoals),
    )
    const movers = computeRankingMovers(all, argWins)
    const arg = movers.find((x) => x.teamId === 'ARG')
    expect(arg).toBeTruthy()
    if (arg) expect(arg.delta).toBeGreaterThanOrEqual(0) // 순위 유지 또는 상승
    // 아무 경기도 없으면 변동 0
    const none = computeRankingMovers(all, [])
    expect(none.every((m) => m.delta === 0)).toBe(true)
  })

  it('실제 FIFA 공식: 기대승점 대칭·중요도(25) 스케일·승부차기 규칙', () => {
    // Wₑ(a,b) + Wₑ(b,a) = 1, 동점이면 0.5
    expect(expectedResult(1500, 1500)).toBeCloseTo(0.5, 6)
    expect(expectedResult(1700, 1300) + expectedResult(1300, 1700)).toBeCloseTo(1, 6)
    // I = 25(월드컵 예선)
    expect(IMPORTANCE_QUALIFIER).toBe(25)
    // 동점수 팀끼리 승리 시 정확히 I×(1−0.5)=+12.5
    const p = { A: 1500, B: 1500 }
    applyMatchElo(p, { homeTeamId: 'A', awayTeamId: 'B', homeGoals: 1, awayGoals: 0 })
    expect(p.A - 1500).toBeCloseTo(12.5, 6)
    expect(p.B - 1500).toBeCloseTo(-12.5, 6)
    // 골 차는 반영하지 않는다(1-0이나 5-0이나 동일)
    const p2 = { A: 1500, B: 1500 }
    applyMatchElo(p2, { homeTeamId: 'A', awayTeamId: 'B', homeGoals: 5, awayGoals: 0 })
    expect(p2.A).toBeCloseTo(p.A, 6)
    // 승부차기: 승자 0.75·패자 0.5 → 둘 다 상승 가능(동점수면 승자 +6.25, 패자 0)
    const pk = { A: 1500, B: 1500 }
    applyMatchElo(pk, { homeTeamId: 'A', awayTeamId: 'B', homeGoals: 1, awayGoals: 1, wentToPenalties: true, winnerTeamId: 'A' })
    expect(pk.A - 1500).toBeCloseTo(6.25, 6)
    expect(pk.B - 1500).toBeCloseTo(0, 6)
  })

  it('갱신 함수는 원본 점수 맵을 변경하지 않는다', () => {
    const base = initRankingPoints(['ARG', 'BRA'])
    const snapshot = { ...base }
    updateRankingPoints(base, [{ homeTeamId: 'ARG', awayTeamId: 'BRA', homeGoals: 3, awayGoals: 0, matchday: 1, group: 0 }])
    expect(base).toEqual(snapshot)
  })

  it('예선 폼 → 본선 컨디션 가감치: 범위 내이고 기대 이상/이하가 부호로 갈린다', () => {
    const all = simulateAllQualification('FORM')
    const offsets = formOffsetsFromResults(all, 6)
    // 모든 값이 -6~+6
    for (const v of Object.values(offsets)) {
      expect(v).toBeGreaterThanOrEqual(-6)
      expect(v).toBeLessThanOrEqual(6)
    }
    // 폼은 기대 대비 성적이라 상승·하락이 모두 존재(균일하게 0이 아님)
    const vals = Object.values(offsets)
    expect(vals.some((v) => v > 0)).toBe(true)
    expect(vals.some((v) => v < 0)).toBe(true)
    // 랭킹 무버(최대 상승/하락)와 부호가 일치한다
    const played = Object.values(all.byConfederation).flatMap((r) => r.matches)
    const movers = computeRankingMovers(all, played)
    const topRiser = movers.find((m) => m.delta > 0)
    const topFaller = movers.find((m) => m.delta < 0)
    if (topRiser) expect(offsets[topRiser.teamId]).toBeGreaterThanOrEqual(0)
    if (topFaller) expect(offsets[topFaller.teamId]).toBeLessThanOrEqual(0)
  })
})

describe('성적 반영 능력치 보정 (overallDeltasFromResults)', () => {
  it('경기 전에는 보정이 0이고, 진행 후에는 ±maxDelta 범위 안에서 부호가 갈린다', () => {
    const all = simulateAllQualification('PERF')
    // 경기 전(빈 배열) → 전부 0
    const none = overallDeltasFromResults(all, [], 5)
    expect(Object.values(none).every((v) => v === 0)).toBe(true)
    // 전체 진행 → 범위 내, 상승·하락 모두 존재
    const played = Object.values(all.byConfederation).flatMap((r) => r.matches)
    const deltas = overallDeltasFromResults(all, played, 5)
    for (const v of Object.values(deltas)) {
      expect(v).toBeGreaterThanOrEqual(-5)
      expect(v).toBeLessThanOrEqual(5)
    }
    const vals = Object.values(deltas)
    expect(vals.some((v) => v > 0)).toBe(true)
    expect(vals.some((v) => v < 0)).toBe(true)
  })
})

describe('실시간 FIFA 랭킹 + 변동 추이', () => {
  it('실시간 랭킹은 전체 참가국을 점수순으로 정렬하고 등락이 일관된다', () => {
    const all = simulateAllQualification('LIVE')
    const played = Object.values(all.byConfederation).flatMap((r) => r.matches)
    const ranking = computeLiveRanking(all, played)
    expect(ranking.length).toBeGreaterThan(100)
    // 점수 내림차순(=순위 오름차순)
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i - 1].points).toBeGreaterThanOrEqual(ranking[i].points)
      expect(ranking[i].rank).toBe(i + 1)
    }
    // 순위 등락 = baseRank − rank, 점수 등락 = points − basePoints
    for (const row of ranking) {
      expect(row.rankDelta).toBe(row.baseRank - row.rank)
      expect(row.pointsDelta).toBe(row.points - row.basePoints)
    }
  })

  it('경기 전 실시간 랭킹은 기존 FIFA 랭킹 순서와 같다(등락 0)', () => {
    const all = simulateAllQualification('LIVE0')
    const ranking = computeLiveRanking(all, [])
    for (const row of ranking) {
      expect(row.rankDelta).toBe(0)
      expect(row.pointsDelta).toBe(0)
    }
  })

  it('변동 추이는 시작점 + 경기일마다 한 점씩, 시간순 누적이다', () => {
    const all = simulateAllQualification('TREND')
    const cal = buildQualCalendar(all)
    const trend = computeRankingTrend(all, cal, ['ARG', 'BRA'])
    expect(trend).toHaveLength(2)
    for (const t of trend) {
      // 시작점 + 경기일 수
      expect(t.series).toHaveLength(cal.length + 1)
      expect(t.series[0].label).toBe('예선 전')
    }
    // 일부만 진행하면 그만큼만 추이가 생긴다
    const partial = computeRankingTrend(all, cal.slice(0, 3), ['ARG'])
    expect(partial[0].series).toHaveLength(4) // 시작 + 3일
  })
})

describe('예선 경기 일정 캘린더 (B2 일별 진행)', () => {
  it('모든 경기가 정확히 하루에 배정되고, 날짜는 오름차순이다', () => {
    const all = simulateAllQualification('CAL')
    const cal = buildQualCalendar(all)
    expect(cal.length).toBeGreaterThan(0)
    // 날짜 오름차순
    for (let i = 1; i < cal.length; i++) {
      expect(cal[i - 1].date <= cal[i].date).toBe(true)
    }
    // 전체 경기 수 = 캘린더에 배정된 경기 수(누락·중복 없음)
    const totalMatches = Object.values(all.byConfederation).reduce((s, r) => s + r.matches.length, 0)
    const scheduled = cal.reduce((s, d) => s + d.matches.length, 0)
    expect(scheduled).toBe(totalMatches)
  })

  it('마지막 경기일에는 모든 대륙이 전체 라운드를 소화한다(누적 공개 = 총 라운드)', () => {
    const all = simulateAllQualification('CAL2')
    const cal = buildQualCalendar(all)
    const last = cal[cal.length - 1]
    for (const c of Object.keys(all.byConfederation)) {
      expect(last.revealedByConfed[c]).toBe(all.byConfederation[c].matchdays)
    }
    // 누적 공개는 경기일이 갈수록 단조 증가
    for (let i = 1; i < cal.length; i++) {
      for (const c of Object.keys(all.byConfederation)) {
        expect(cal[i].revealedByConfed[c]).toBeGreaterThanOrEqual(cal[i - 1].revealedByConfed[c])
      }
    }
  })

  it('같은 시드는 같은 일정을 재현한다', () => {
    const a = buildQualCalendar(simulateAllQualification('CAL-SAME'))
    const b = buildQualCalendar(simulateAllQualification('CAL-SAME'))
    expect(a.map((d) => d.date + ':' + d.matches.length)).toEqual(b.map((d) => d.date + ':' + d.matches.length))
  })
})

describe('예선 명장면 피드 (개선 F3)', () => {
  it('드라마 점수 내림차순으로 상위 N개를 뽑고 유형을 분류한다', () => {
    const all = simulateAllQualification('HL')
    const hl = computeQualHighlights(all, 6)
    expect(hl.length).toBe(6)
    for (let i = 1; i < hl.length; i++) {
      expect(hl[i - 1].score).toBeGreaterThanOrEqual(hl[i].score)
    }
    for (const h of hl) {
      expect(['대이변', '대승', '골잔치', '명승부']).toContain(h.category)
      expect(all.byConfederation[h.confederation]).toBeTruthy()
    }
  })

  it('같은 시드는 같은 명장면을 재현한다', () => {
    const a = computeQualHighlights(simulateAllQualification('HL-SAME'))
    const b = computeQualHighlights(simulateAllQualification('HL-SAME'))
    expect(a.map((h) => h.match.homeTeamId + h.match.awayTeamId)).toEqual(
      b.map((h) => h.match.homeTeamId + h.match.awayTeamId),
    )
  })
})

describe('전력 세분화 styleBias (개선 C3)', () => {
  it('명시값이 있으면 그대로 쓰고, 없으면 결정적으로 -6~+6 범위를 만든다', () => {
    expect(resolveStyleBias('XXX', 'UEFA', 4)).toBe(4)
    const a = resolveStyleBias('KEN', 'CAF')
    const b = resolveStyleBias('KEN', 'CAF')
    expect(a).toBe(b) // 결정적(재현)
    expect(a).toBeGreaterThanOrEqual(-6)
    expect(a).toBeLessThanOrEqual(6)
  })

  it('styleBias 미지정 팀들도 공격/수비가 균형만 있지 않고 다양해진다', () => {
    // 비본선 참가국 중 다수가 attack≠defense(성향 반영)이어야 한다
    const quals = ALL_NATIONS.filter((t) => !['ARG', 'BRA', 'ESP', 'FRA'].includes(t.id))
    const varied = quals.filter((t) => t.baseRatings.attack !== t.baseRatings.defense)
    expect(varied.length).toBeGreaterThan(quals.length / 2)
    // overall(종합 전력)은 성향과 무관하게 유지된다(공수 배분만 이동, 클램프 예외 제외)
    const balanced = ALL_NATIONS.filter((t) => {
      const mid = (t.baseRatings.attack + t.baseRatings.defense) / 2
      return Math.abs(mid - t.baseRatings.overall) <= 1
    })
    expect(balanced.length).toBeGreaterThan(ALL_NATIONS.length * 0.8)
  })
})

describe('What-if 진출 분석 (개선 G3)', () => {
  it('전력을 높일수록 진출 확률이 오르고 낮출수록 내려간다', () => {
    // 약체(볼리비아)로 델타 효과가 뚜렷하게 나타나도록
    const scenarios = runWhatIfScenarios('BOL', [-15, 0, 30], 25, 'WHATIF')
    expect(scenarios).toHaveLength(3)
    const [weak, base, strong] = scenarios
    expect(strong.probability).toBeGreaterThanOrEqual(base.probability)
    expect(base.probability).toBeGreaterThanOrEqual(weak.probability)
    // 크게 강화하면 유의미하게 상승
    expect(strong.probability).toBeGreaterThan(weak.probability)
  })

  it('같은 seedBase는 같은 결과를 재현한다', () => {
    const a = runWhatIfScenarios('KOR', [0, 10], 15, 'WHATIF-SAME')
    const b = runWhatIfScenarios('KOR', [0, 10], 15, 'WHATIF-SAME')
    expect(a.map((s) => s.probability)).toEqual(b.map((s) => s.probability))
  })
})

describe('예선 이변 기사 (개선 F2)', () => {
  it('약체가 강호를 이긴 최대 격차 경기를 골라 기사를 만든다', () => {
    const all = simulateAllQualification('UPSET')
    const params = pickQualUpset(all)
    expect(params).toBeTruthy()
    if (params) {
      // 승자의 FIFA 랭킹 숫자가 패자보다 커야(=약체) 이변
      expect(ALL_NATIONS_BY_ID[params.winnerTeamId].fifaRankApprox).toBeGreaterThan(
        ALL_NATIONS_BY_ID[params.loserTeamId].fifaRankApprox,
      )
      expect(params.winnerGoals).toBeGreaterThan(params.loserGoals)
      const article = generateUpsetArticle(params)
      expect(article.headline.length).toBeGreaterThan(0)
      expect(article.paragraphs.length).toBeGreaterThan(0)
    }
  })

  it('같은 시드는 같은 이변 경기를 고른다', () => {
    const a = pickQualUpset(simulateAllQualification('UPSET-SAME'))
    const b = pickQualUpset(simulateAllQualification('UPSET-SAME'))
    expect(a?.winnerTeamId).toBe(b?.winnerTeamId)
    expect(a?.loserTeamId).toBe(b?.loserTeamId)
  })
})

describe('행운/불운 분석 (개선 G5)', () => {
  it('행운=진출·저확률, 불운=탈락·고확률로 분류한다', () => {
    const all = simulateAllQualification('LUCK')
    // 인위적 확률: BOL 저확률 진출(행운), 임의 고확률 탈락 팀 구성
    const probs: Record<string, number> = {}
    for (const id of all.qualified48) probs[id] = 90
    // 진출국 하나를 저확률로
    const luckyId = all.qualified48.find((id) => !all.hosts.includes(id))!
    probs[luckyId] = 20
    // 탈락국 하나를 고확률로
    const someEliminated = 'BOL'
    if (!all.qualified48.includes(someEliminated)) probs[someEliminated] = 80

    const luck = computeLuckAnalysis(all, probs)
    for (const e of luck.lucky) expect(all.qualified48).toContain(e.teamId)
    for (const e of luck.unlucky) expect(all.qualified48).not.toContain(e.teamId)
    expect(luck.lucky.some((e) => e.teamId === luckyId)).toBe(true)
    if (!all.qualified48.includes(someEliminated)) {
      expect(luck.unlucky.some((e) => e.teamId === someEliminated)).toBe(true)
    }
    // 개최국은 제외
    for (const host of all.hosts) {
      expect(luck.lucky.some((e) => e.teamId === host)).toBe(false)
    }
  })
})

describe('대륙 난이도 지수 (개선 G4)', () => {
  it('자리당 경쟁 팀 수를 대륙별로 계산하고 내림차순 정렬한다', () => {
    const d = computeConfedDifficulty()
    expect(d).toHaveLength(6)
    // 내림차순
    for (let i = 1; i < d.length; i++) {
      expect(d[i - 1].ratio).toBeGreaterThanOrEqual(d[i].ratio)
    }
    // CONCACAF는 개최 3국을 참가/자리에서 제외한다
    const ccf = d.find((x) => x.confederation === 'CONCACAF')!
    expect(ccf.spots).toBe(SLOT_ALLOCATION.CONCACAF.direct - 3 + SLOT_ALLOCATION.CONCACAF.playoff) // 3 + 2
    // 모든 대륙의 participants·spots는 양수
    for (const x of d) {
      expect(x.participants).toBeGreaterThan(0)
      expect(x.spots).toBeGreaterThan(0)
    }
  })
})

describe('포맷 데이터 주도화 (개선 C4)', () => {
  const allRatings = baseRatingsMap(ALL_NATIONS.map((t) => t.id))

  it('CONMEBOL(단일리그)은 조 수가 QUAL_FORMAT.numGroups를 따른다', () => {
    // CONMEBOL만 순수 단일리그. UEFA·CAF·OFC는 플레이오프/녹아웃 경로가 붙으므로 별도 검증(아래).
    const fmt = QUAL_FORMAT.CONMEBOL
    if (fmt.kind !== 'groups') throw new Error('CONMEBOL은 groups 포맷')
    const r = simulateConfederation('CONMEBOL', allRatings, createSeededRandom('fmt-conmebol'))
    expect(r.groups.length).toBe(fmt.numGroups)
  })

  it('UEFA는 조별 12개 조 + 플레이오프 4개 경로 = 16 (B14)', () => {
    const fmt = QUAL_FORMAT.UEFA
    if (fmt.kind !== 'groups') throw new Error('UEFA는 groups 포맷')
    const r = simulateConfederation('UEFA', allRatings, createSeededRandom('fmt-uefa'))
    expect(r.groups.length).toBe(fmt.numGroups + 4)
    expect(r.groupLabels?.slice(-4)).toEqual(['PO 경로 A', 'PO 경로 B', 'PO 경로 C', 'PO 경로 D'])
  })

  it('CAF는 9개 조 + 최고 2위 미니토너먼트 = 10 (B15)', () => {
    const r = simulateConfederation('CAF', allRatings, createSeededRandom('fmt-caf'))
    expect(r.groups.length).toBe(10)
    expect(r.groupLabels?.[9]).toBe('최고 2위 PO')
    expect(r.qualified).toHaveLength(SLOT_ALLOCATION.CAF.direct)
    expect(r.playoff).toHaveLength(SLOT_ALLOCATION.CAF.playoff)
  })

  it('OFC는 2개 조 + 녹아웃 = 3, 결승 승자 직행·패자 PO (B16)', () => {
    const r = simulateConfederation('OFC', allRatings, createSeededRandom('fmt-ofc'))
    expect(r.groups.length).toBe(3)
    expect(r.groupLabels?.[2]).toBe('녹아웃')
    expect(r.qualified).toHaveLength(SLOT_ALLOCATION.OFC.direct)
    expect(r.playoff).toHaveLength(SLOT_ALLOCATION.OFC.playoff)
  })

  it('AFC/CONCACAF 스테이지 조 수가 포맷 파라미터와 일치한다', () => {
    const afc = QUAL_FORMAT.AFC
    if (afc.kind === 'afc') {
      const r = simulateConfederation('AFC', allRatings, createSeededRandom('fmt-afc'))
      // 1차 예선 + 2차 조 + 3차 조 + 4차 조 + 5차 PO
      expect(r.groups.length).toBe(1 + afc.round2Groups + afc.round3Groups + afc.round4Groups + 1)
    }
    const ccf = QUAL_FORMAT.CONCACAF
    if (ccf.kind === 'concacaf') {
      const r = simulateConfederation('CONCACAF', allRatings, createSeededRandom('fmt-ccf'))
      // 1차 예선 + 2차 조 + 최종 조
      expect(r.groups.length).toBe(1 + ccf.round2Groups + ccf.finalGroups)
    }
  })
})

describe('동적 개최국 (커리어 모드)', () => {
  it('다른 대륙 개최국이면 그 대륙 직행이 줄고 48은 유효하다', () => {
    // ESP·POR(UEFA 2) + MAR(CAF 1) 공동 개최
    const all = simulateAllQualification('HOSTS-A', undefined, undefined, ['ESP', 'POR', 'MAR'])
    expect(all.qualified48).toHaveLength(48)
    expect(new Set(all.qualified48).size).toBe(48)
    for (const h of ['ESP', 'POR', 'MAR']) expect(all.qualified48).toContain(h)
    // UEFA 직행 = 16 − 2(개최), CAF 직행 = 9 − 1
    expect(all.byConfederation.UEFA.qualified).toHaveLength(SLOT_ALLOCATION.UEFA.direct - 2)
    expect(all.byConfederation.CAF.qualified).toHaveLength(SLOT_ALLOCATION.CAF.direct - 1)
    // 개최국은 자기 대륙 예선 진출국에 포함되지 않는다
    expect(all.byConfederation.UEFA.qualified).not.toContain('ESP')
    expect(all.byConfederation.CAF.qualified).not.toContain('MAR')
  })

  it('아시아 단독 개최(사우디)면 AFC 직행이 7로 줄고 48 유효', () => {
    const all = simulateAllQualification('HOSTS-B', undefined, undefined, ['KSA'])
    expect(all.qualified48).toHaveLength(48)
    expect(new Set(all.qualified48).size).toBe(48)
    expect(all.qualified48).toContain('KSA')
    expect(all.byConfederation.AFC.qualified).toHaveLength(SLOT_ALLOCATION.AFC.direct - 1)
    expect(all.byConfederation.AFC.qualified).not.toContain('KSA')
    // 개최국이 없는 CONCACAF는 원래대로 직행 3 + PO 2(비개최 풀)... 이 경우 개최국이 CONCACAF에
    // 없으므로 CONCACAF 직행 = 6 - 0 = 6.
    expect(all.byConfederation.CONCACAF.qualified).toHaveLength(SLOT_ALLOCATION.CONCACAF.direct)
  })
})

describe('다단계 대륙 구조 (개선 A3·A4)', () => {
  const allRatings = baseRatingsMap(ALL_NATIONS.map((t) => t.id))

  it('AFC는 1차 예선 + 2·3·4차 조 + 5차 PO로 구성된다', () => {
    const r = simulateConfederation('AFC', allRatings, createSeededRandom('AFC-ms'))
    // 1차 예선 + 2차 9조 + 3차 3조 + 4차 2조 + 5차 PO = 16개 "그룹"
    expect(r.groupLabels?.[0]).toBe('1차 예선')
    expect(r.groupLabels).toContain('2차 A조')
    expect(r.groupLabels).toContain('3차 A조')
    expect(r.groupLabels).toContain('3차 C조')
    expect(r.groupLabels).toContain('4차 B조')
    expect(r.groupLabels).toContain('5차 PO(2연전)')
    // 3차는 정확히 3개 조 × 6팀(18팀) — B8 불균형 정정
    expect(r.groups[r.groupLabels!.indexOf('3차 A조')]).toHaveLength(6)
    expect(r.qualified).toHaveLength(8) // 3차 6 + 4차 2
    expect(r.playoff).toHaveLength(1) // 5차 승자
    // 스테이지가 매치데이로 이어진다(마지막 경기 matchday == 총 라운드 수)
    expect(Math.max(...r.matches.map((m) => m.matchday))).toBe(r.matchdays)
    // 진출·PO 팀은 서로 겹치지 않는다
    expect(new Set([...r.qualified, ...r.playoff]).size).toBe(9)
  })

  it('CONCACAF는 1차·2차 예비예선 + 최종 3개 조(4팀)로 구성되고 개최국을 제외한다', () => {
    const r = simulateConfederation('CONCACAF', allRatings, createSeededRandom('CCF-ms'))
    expect(r.groupLabels?.[0]).toBe('1차 예선')
    expect(r.groupLabels).toContain('2차 A조')
    expect(r.groupLabels).toContain('최종 A조')
    expect(r.groupLabels).toContain('최종 C조')
    // 최종 라운드는 3개 조 × 4팀(12팀) — B12 정정
    expect(r.groups[r.groupLabels!.indexOf('최종 A조')]).toHaveLength(4)
    expect(r.qualified).toHaveLength(3) // 최종 각 조 1위
    expect(r.playoff).toHaveLength(2) // 최고 2위
    for (const host of ['MEX', 'USA', 'CAN']) {
      expect(r.qualified).not.toContain(host)
      expect(r.playoff).not.toContain(host)
    }
  })

  it('다단계 대륙을 포함해도 본선 48은 유효하다', () => {
    const all = simulateAllQualification('MULTISTAGE')
    expect(new Set(all.qualified48).size).toBe(48)
    expect(all.qualified48).toHaveLength(48)
  })
})

describe('simulateAllQualification — 본선 48 확정', () => {
  it('정확히 48개국, 중복 없음, 개최 3국 포함', () => {
    const all = simulateAllQualification('WORLD-2026')
    expect(all.qualified48).toHaveLength(48)
    expect(new Set(all.qualified48).size).toBe(48)
    for (const host of ['MEX', 'USA', 'CAN']) expect(all.qualified48).toContain(host)
  })

  it('대륙간 플레이오프는 6팀 → 2장', () => {
    const all = simulateAllQualification('WORLD-2026')
    expect(all.interConfed.participants).toHaveLength(6)
    expect(all.interConfed.winners).toHaveLength(2)
    for (const w of all.interConfed.winners) expect(all.qualified48).toContain(w)
  })

  it('같은 시드는 같은 본선 진출국을 재현한다', () => {
    const a = simulateAllQualification('SEED-Z')
    const b = simulateAllQualification('SEED-Z')
    expect(a.qualified48).toEqual(b.qualified48)
  })

  it('모든 진출국은 실존 등록국이다', () => {
    const all = simulateAllQualification('CHECK')
    for (const id of all.qualified48) expect(ALL_NATIONS_BY_ID[id]).toBeTruthy()
  })
})

describe('computePots — 예선 결과 → 본선 동적 포트 (지역예선 Q4)', () => {
  const field = simulateAllQualification('POT-TEST').qualified48

  it('개최 3국을 제외한 45국을 9·12·12·12로 나눈다', () => {
    const pots = computePots(field)
    expect(pots[1]).toHaveLength(9)
    expect(pots[2]).toHaveLength(12)
    expect(pots[3]).toHaveLength(12)
    expect(pots[4]).toHaveLength(12)
    // 개최국은 포트 풀에 없음(슬롯 고정)
    for (const host of ['MEX', 'USA', 'CAN']) {
      expect([...pots[1], ...pots[2], ...pots[3], ...pots[4]]).not.toContain(host)
    }
  })

  it('포트1이 포트4보다 평균 랭킹이 높다(숫자가 작다)', () => {
    const pots = computePots(field)
    const avg = (ids: string[]) => ids.reduce((s, id) => s + ALL_NATIONS_BY_ID[id].fifaRankApprox, 0) / ids.length
    expect(avg(pots[1])).toBeLessThan(avg(pots[4]))
  })

  it('전체 예선으로 뽑은 필드는 유효한 조추첨을 구성할 수 있다', () => {
    const { state } = runSeededDraw('DRAWFROMFIELD', computePots(field))
    // 12개 조가 4팀씩
    for (const g of Object.values(state.groups) as (string | null)[][]) {
      expect(g.filter(Boolean)).toHaveLength(4)
    }
  })
})

describe('예선 진출 확률 (지역예선 Q5)', () => {
  it('개최국은 항상 100%, 강팀 > 약팀 진출률', () => {
    const acc = createQualProbAccumulator('PROB')
    acc.runBatch(30)
    const probs = acc.result()
    expect(probs.USA).toBe(100)
    expect(probs.MEX).toBe(100)
    // 아르헨티나(랭킹1)가 볼리비아(약체)보다 진출률 높음
    expect(probs.ARG ?? 0).toBeGreaterThanOrEqual(probs.BOL ?? 0)
  })

  it('같은 seedBase는 같은 확률을 재현한다', () => {
    const a = createQualProbAccumulator('SAME')
    a.runBatch(20)
    const b = createQualProbAccumulator('SAME')
    b.runBatch(20)
    expect(a.result().ARG).toBe(b.result().ARG)
  })

  it('진출국뿐 아니라 회원군 전체(210개국)를 확률에 포함한다 — 한 번도 진출 못 해도 0%로 표시', () => {
    const acc = createQualProbAccumulator('ALL')
    acc.runBatch(30)
    const probs = acc.result()
    // 6개 대륙 회원국 전체가 결과에 들어간다(약체는 0%라도 대시보드에 나타나야 함).
    expect(Object.keys(probs).length).toBe(210)
    // 최소 한 팀은 0%(한 번도 진출 못 함)로 존재한다.
    expect(Object.values(probs).some((p) => p === 0)).toBe(true)
    // 모든 확률은 0~100 범위.
    for (const p of Object.values(probs)) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(100)
    }
  })
})

describe('횡단 순위 — 불균등 조 크기 보정 (D26)', () => {
  const m = (home: string, away: string, hg: number, ag: number, matchday: number, group: number): QualMatch => ({
    homeTeamId: home,
    awayTeamId: away,
    homeGoals: hg,
    awayGoals: ag,
    matchday,
    group,
  })

  it('큰 조의 최하위 팀과의 경기를 제외해 공정하게 비교한다', () => {
    // 조0(3팀): ARG > BRA > BOL(최하위). 조1(2팀): FRA, GER.
    // BRA는 BOL을 크게 이겨 기록이 부풀려졌지만(5-0), 최하위전 제외 시 GER보다 아래여야 한다.
    const groupRankings = [
      ['ARG', 'BRA', 'BOL'],
      ['FRA', 'GER'],
    ]
    const matches: QualMatch[] = [
      m('ARG', 'BRA', 1, 0, 1, 0),
      m('ARG', 'BOL', 1, 0, 2, 0),
      m('BRA', 'BOL', 5, 0, 3, 0), // 최하위전 — 제외 대상
      m('FRA', 'GER', 0, 0, 1, 1),
    ]
    const teams = ['ARG', 'BRA', 'BOL', 'FRA', 'GER']
    const order = rankAcrossGroups(groupRankings, matches, teams)
    // 최하위전(BRA-BOL) 제외로 BRA는 승점이 사라져 GER(무승부 1점)보다 아래.
    expect(order.indexOf('GER')).toBeLessThan(order.indexOf('BRA'))
    expect(order[order.length - 1]).toBe('BOL')
  })

  it('조 크기가 모두 같으면 전체 기록 그대로 비교한다', () => {
    const groupRankings = [
      ['ARG', 'BRA'],
      ['FRA', 'GER'],
    ]
    const matches: QualMatch[] = [m('ARG', 'BRA', 3, 0, 1, 0), m('FRA', 'GER', 1, 0, 1, 1)]
    const order = rankAcrossGroups(groupRankings, matches, ['ARG', 'BRA', 'FRA', 'GER'])
    // 1위끼리(ARG,FRA) 먼저, 2위끼리(BRA,GER) 뒤. 승점 동률이라 기록/랭킹으로 정렬.
    expect(order.indexOf('ARG')).toBeLessThan(order.indexOf('BRA'))
    expect(order.indexOf('FRA')).toBeLessThan(order.indexOf('GER'))
  })
})

describe('라운드로빈 매치데이 계산 일반화 (D27)', () => {
  it('짝수 팀은 n−1, 홀수 팀은 n 라운드(단판)', () => {
    expect(roundRobinSingleRounds(4)).toBe(3)
    expect(roundRobinSingleRounds(5)).toBe(5)
    expect(roundRobinSingleRounds(6)).toBe(5)
    expect(roundRobinSingleRounds(10)).toBe(9)
  })

  it('홈&어웨이는 단일 사이클의 2배', () => {
    expect(roundRobinMatchdayCount(4, true)).toBe(6)
    expect(roundRobinMatchdayCount(5, true)).toBe(10)
    expect(roundRobinMatchdayCount(6, true)).toBe(10)
    expect(roundRobinMatchdayCount(10, true)).toBe(18)
  })

  it('엔진 실제 매치데이와 일치한다 — CONMEBOL(10팀 홈&어웨이)=18', () => {
    const all = simulateAllQualification('MDGEN')
    expect(all.byConfederation.CONMEBOL.matchdays).toBe(roundRobinMatchdayCount(10, true))
  })
})

describe('매치데이 구조 (개선 B1)', () => {
  it('CONMEBOL(10팀 홈&어웨이)은 18라운드, 경기마다 유효 matchday', () => {
    const all = simulateAllQualification('MD')
    const c = all.byConfederation.CONMEBOL
    expect(c.matchdays).toBe(18)
    for (const m of c.matches) {
      expect(m.matchday).toBeGreaterThanOrEqual(1)
      expect(m.matchday).toBeLessThanOrEqual(18)
    }
  })
  it('UEFA(54개국 12개 조 홈&어웨이 + 플레이오프)는 12라운드 (A5·B14)', () => {
    // 조별리그 10라운드(5팀 조 더블 라운드로빈) + 플레이오프 준결승·결승 2라운드 = 12.
    expect(simulateAllQualification('MD').byConfederation.UEFA.matchdays).toBe(12)
  })
  it('groups 구조가 노출된다(H1)', () => {
    const all = simulateAllQualification('MD')
    // UEFA: 12개 조 + 플레이오프 4개 경로 = 16.
    expect(all.byConfederation.UEFA.groups.length).toBe(16)
    expect(all.byConfederation.CONMEBOL.groups.length).toBe(1)
  })
})

describe('능력치 주입 (개선 D1)', () => {
  it('약체(볼리비아)를 최강으로 키우면 본선에 진출한다', () => {
    const boosted = baseRatingsMap(ALL_NATIONS.map((t) => t.id))
    boosted.BOL = { attack: 99, defense: 99, form: 99, overall: 99 }
    const res = simulateAllQualification('D1TEST', boosted)
    expect(res.qualified48).toContain('BOL')
  })
})

describe('예선 드라마 (지역예선 Q6)', () => {
  it('깜짝 진출/충격 탈락을 랭킹 대조로 뽑고 개최국은 제외한다', () => {
    const all = simulateAllQualification('DRAMA')
    const drama = extractQualDrama(all)
    expect(drama.surpriseQualifiers.length).toBeGreaterThan(0)
    for (const d of drama.surpriseQualifiers) {
      expect(['MEX', 'USA', 'CAN']).not.toContain(d.teamId)
      expect(all.qualified48).toContain(d.teamId)
    }
    for (const d of drama.shockEliminations) {
      expect(all.qualified48).not.toContain(d.teamId)
    }
  })
})

describe('공개 라운드 기본값 — 미지정 대륙은 아직 미시작 (#8)', () => {
  it('revealed에 키가 없는 대륙은 잠금 경기 0개(전체 공개로 오인하지 않는다)', async () => {
    const { collectPlayedByConfed, isPartialProgress } = await import('../src/engine/qualification/conditional')
    const all = simulateAllQualification('REVEAL-DEFAULT')
    // 어떤 대륙도 공개하지 않은 상태(빈 revealed).
    const played = collectPlayedByConfed(all, {})
    for (const c of Object.keys(all.byConfederation)) {
      expect(played[c]).toEqual([]) // 미지정 = 미시작 → 잠긴(치른) 경기 없음
    }
    // 하나도 공개 안 됐으면 "부분 진행"으로 간주(모든 대륙이 아직 안 끝남 → 조건부 확률 의미 있음).
    expect(isPartialProgress(all, {})).toBe(true)
  })

  it('특정 대륙만 공개하면 그 대륙만 잠금 경기가 잡힌다', async () => {
    const { collectPlayedByConfed } = await import('../src/engine/qualification/conditional')
    const all = simulateAllQualification('REVEAL-ONE')
    const played = collectPlayedByConfed(all, { UEFA: 1 })
    expect(played.UEFA.every((m) => m.matchday <= 1)).toBe(true)
    // 다른 대륙(예: CAF)은 여전히 미지정 → 잠금 경기 0개.
    expect(played.CAF).toEqual([])
  })
})
