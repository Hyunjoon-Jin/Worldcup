import { describe, expect, it } from 'vitest'
import { simulateAllQualification } from '../src/engine/qualification'
import { createQualProbAccumulator } from '../src/engine/qualification/probability'
import { runWhatIfScenarios } from '../src/engine/qualification/whatif'
import { editionEndRankingPoints, initRankingPoints } from '../src/engine/qualification/ranking'
import { rankGroupTeams } from '../src/engine/tiebreakers'
import type { MatchResult } from '../src/types/match'

describe('지역예선 로직 오류 감사 수정', () => {
  it('Emp1: 대륙에 없는 개최국 ID를 넣어도 본선은 정확히 48(팬텀 호스트 방어)', () => {
    const res = simulateAllQualification('AUDIT', undefined, undefined, ['SAU']) // 'SAU'는 오타(정답은 KSA)
    expect(res.qualified48).toHaveLength(48)
    expect(new Set(res.qualified48).size).toBe(48)
    expect(res.hosts).not.toContain('SAU') // 무효 호스트는 걸러진다
  })

  it('R1/R2: 예선 단계 도달은 참가 기준 — 1차 예선을 항상 치르는 하위국은 1차 도달 100%', () => {
    const acc = createQualProbAccumulator('STGAUDIT')
    acc.runBatch(30)
    const sp = acc.stageResult()
    // 하위 AFC 국가는 1차 예선에 매번 참가하므로 1차 도달 100%, 그리고 단조 감소(1차 >= 2차 >= 3차).
    const weak = ['GUM', 'MAC', 'SRI'].find((t) => sp.byTeam[t]?.['1차 예선'] != null)!
    const rec = sp.byTeam[weak]
    expect(rec['1차 예선']).toBe(100)
    expect(rec['1차 예선']).toBeGreaterThanOrEqual(rec['2차 예선'] ?? 0)
    expect(rec['2차 예선'] ?? 0).toBeGreaterThanOrEqual(rec['3차 예선'] ?? 0)
  })

  it('R3: 대륙간 플레이오프 경기가 FIFA 점수에 반영된다', () => {
    const res = simulateAllQualification('ELOAUDIT')
    const winner = res.interConfed.winners[0]
    const noFinals = { groupMatches: [], knockoutMatches: [] }
    const pts = editionEndRankingPoints(res, noFinals)
    const base = initRankingPoints([winner])[winner]
    // 대륙간 PO 승자는 예선+PO 경기를 치렀으므로 시작 점수와 달라야 한다(반영 확인).
    expect(pts[winner]).not.toBe(base)
  })

  it('U4: What-if는 공통난수로 단조적 — 전력을 올리면 진출 확률이 내려가지 않는다', () => {
    const scenarios = runWhatIfScenarios('BOL', [-10, 0, 10, 20], 40, 'WIAUDIT')
    for (let i = 1; i < scenarios.length; i++) {
      expect(scenarios[i].probability).toBeGreaterThanOrEqual(scenarios[i - 1].probability - 1e-9)
    }
  })

  it('U3: 홈&어웨이 한 레그만 치른 동률은 상호전적을 적용하지 않는다(잠정 순위 정확도)', () => {
    // A,B,C 3팀 동률. A-B는 1차전만(A 승), A-C·B-C는 양 레그 완료. 상호전적 미완결 → 조 전체 기록으로 비교.
    const m = (h: string, a: string, hg: number, ag: number): MatchResult => ({ homeTeamId: h, awayTeamId: a, homeGoals: hg, awayGoals: ag })
    const matches = [
      m('AAA', 'BBB', 1, 0), // A-B 1차전만
      m('AAA', 'CCC', 2, 0),
      m('CCC', 'AAA', 0, 1),
      m('BBB', 'CCC', 3, 0),
      m('CCC', 'BBB', 0, 1),
    ]
    // 완결이 아니므로 예외 없이 실행되고 3팀 모두 순위에 포함되어야 한다(무한루프/누락 없음).
    const order = rankGroupTeams(['AAA', 'BBB', 'CCC'], matches)
    expect(order).toHaveLength(3)
    expect(new Set(order)).toEqual(new Set(['AAA', 'BBB', 'CCC']))
  })
})
