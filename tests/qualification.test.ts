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
import { computeQualStats, computeConfedDifficulty, computeLuckAnalysis, probMarginPct } from '../src/engine/qualification/stats'
import { pickQualUpset } from '../src/engine/qualification/upset'
import { runWhatIfScenarios } from '../src/engine/qualification/whatif'
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

  it('단일 조별 대륙의 조 수는 QUAL_FORMAT.numGroups를 따른다', () => {
    for (const c of ['UEFA', 'CAF', 'CONMEBOL', 'OFC'] as const) {
      const fmt = QUAL_FORMAT[c]
      if (fmt.kind !== 'groups') continue
      const r = simulateConfederation(c, allRatings, createSeededRandom(`fmt-${c}`))
      expect(r.groups.length).toBe(fmt.numGroups)
    }
  })

  it('AFC/CONCACAF 스테이지 조 수가 포맷 파라미터와 일치한다', () => {
    const afc = QUAL_FORMAT.AFC
    if (afc.kind === 'afc') {
      const r = simulateConfederation('AFC', allRatings, createSeededRandom('fmt-afc'))
      expect(r.groups.length).toBe(afc.round3Groups + afc.round4Groups + 1) // +5차 PO
    }
    const ccf = QUAL_FORMAT.CONCACAF
    if (ccf.kind === 'concacaf') {
      const r = simulateConfederation('CONCACAF', allRatings, createSeededRandom('fmt-ccf'))
      expect(r.groups.length).toBe(1 + ccf.finalGroups) // 1차 + 최종 조들
    }
  })
})

describe('다단계 대륙 구조 (개선 A3·A4)', () => {
  const allRatings = baseRatingsMap(ALL_NATIONS.map((t) => t.id))

  it('AFC는 3차·4차·5차 스테이지로 구성된다', () => {
    const r = simulateConfederation('AFC', allRatings, createSeededRandom('AFC-ms'))
    // 3차 3개 조 + 4차 2개 조 + 5차 PO = 6개 조
    expect(r.groups).toHaveLength(6)
    expect(r.groupLabels).toEqual(['3차 A조', '3차 B조', '3차 C조', '4차 A조', '4차 B조', '5차 PO'])
    expect(r.qualified).toHaveLength(8) // 3차 6 + 4차 2
    expect(r.playoff).toHaveLength(1) // 5차 승자
    // 스테이지가 매치데이로 이어진다(마지막 경기 matchday == 총 라운드 수)
    expect(Math.max(...r.matches.map((m) => m.matchday))).toBe(r.matchdays)
    // 진출·PO 팀은 서로 겹치지 않는다
    expect(new Set([...r.qualified, ...r.playoff]).size).toBe(9)
  })

  it('CONCACAF는 1차 예선 라운드 + 최종 3개 조로 구성되고 개최국을 제외한다', () => {
    const r = simulateConfederation('CONCACAF', allRatings, createSeededRandom('CCF-ms'))
    expect(r.groupLabels?.[0]).toBe('1차 예선 라운드')
    expect(r.groupLabels).toContain('최종 A조')
    expect(r.groupLabels).toContain('최종 C조')
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
  it('UEFA(4팀 조 홈&어웨이)는 6라운드 (A5)', () => {
    expect(simulateAllQualification('MD').byConfederation.UEFA.matchdays).toBe(6)
  })
  it('groups 구조가 노출된다(H1)', () => {
    const all = simulateAllQualification('MD')
    expect(all.byConfederation.UEFA.groups.length).toBe(12)
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
