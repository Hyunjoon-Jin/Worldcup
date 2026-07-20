import { describe, it, expect } from 'vitest'
import { generateSeasonNews, type SeasonNewsInput } from '../src/engine/news/seasonNews'
import { ALL_NATIONS } from '../src/data/nations'
import type { LiveRankRow } from '../src/engine/qualification/ranking'

// 실재 팀 ID 몇 개(헤드라인에 이름이 나오도록).
const KOR = ALL_NATIONS.find((n) => n.id === 'KOR')?.id ?? ALL_NATIONS[0].id
const BRA = ALL_NATIONS.find((n) => n.id === 'BRA')?.id ?? ALL_NATIONS[1].id
const JPN = ALL_NATIONS.find((n) => n.id === 'JPN')?.id ?? ALL_NATIONS[2].id

function liveRow(teamId: string, rankDelta: number): LiveRankRow {
  return { teamId, rank: 20, baseRank: 20 + rankDelta, rankDelta, points: 1500, basePoints: 1490, pointsDelta: 10 }
}

describe('시즌 뉴스 생성(D)', () => {
  it('빈 입력이면 헤드라인이 없다', () => {
    expect(generateSeasonNews({})).toEqual([])
  })

  it('월드컵 우승이 가장 큰 뉴스로 맨 앞에 온다', () => {
    const news = generateSeasonNews({ wcChampion: BRA, wcYear: 2026, liveRanking: [liveRow(KOR, 15)] })
    expect(news[0].category).toBe('champion')
    expect(news[0].teamIds[0]).toBe(BRA)
    expect(news[0].headline).toContain('월드컵')
  })

  it('순위 급등/급락은 임계값(10계단) 이상만 뉴스가 된다', () => {
    const news = generateSeasonNews({ liveRanking: [liveRow(KOR, 12), liveRow(JPN, -11), liveRow(BRA, 5)] })
    const ids = news.map((n) => n.teamIds[0])
    expect(ids).toContain(KOR) // +12 급상승
    expect(ids).toContain(JPN) // -11 급하락
    expect(ids).not.toContain(BRA) // +5 미달
    expect(news.find((n) => n.teamIds[0] === KOR)!.category).toBe('rankUp')
    expect(news.find((n) => n.teamIds[0] === JPN)!.category).toBe('rankDown')
  })

  it('연승/연패는 3연속 이상만 잡고, 최근 결과 기준으로 판정한다', () => {
    // KOR 4연승, JPN 2연패(미달), BRA 3연패.
    const played = [
      { homeTeamId: KOR, awayTeamId: 'X1', homeGoals: 2, awayGoals: 0 },
      { homeTeamId: KOR, awayTeamId: 'X2', homeGoals: 1, awayGoals: 0 },
      { homeTeamId: KOR, awayTeamId: 'X3', homeGoals: 3, awayGoals: 1 },
      { homeTeamId: KOR, awayTeamId: 'X4', homeGoals: 2, awayGoals: 1 },
      { homeTeamId: JPN, awayTeamId: 'Y1', homeGoals: 0, awayGoals: 1 },
      { homeTeamId: JPN, awayTeamId: 'Y2', homeGoals: 0, awayGoals: 2 },
      { homeTeamId: BRA, awayTeamId: 'Z1', homeGoals: 0, awayGoals: 1 },
      { homeTeamId: BRA, awayTeamId: 'Z2', homeGoals: 1, awayGoals: 2 },
      { homeTeamId: BRA, awayTeamId: 'Z3', homeGoals: 0, awayGoals: 3 },
    ]
    const news = generateSeasonNews({ playedMatches: played }, 20)
    const win = news.find((n) => n.category === 'streakWin' && n.teamIds[0] === KOR)
    const loss = news.find((n) => n.category === 'streakLoss' && n.teamIds[0] === BRA)
    expect(win?.headline).toContain('4연승')
    expect(loss?.headline).toContain('3연패')
    expect(news.some((n) => n.teamIds[0] === JPN && (n.category === 'streakLoss' || n.category === 'streakWin'))).toBe(false)
  })

  it('연승이 마지막 무승부/패로 끊기면 잡히지 않는다', () => {
    const played = [
      { homeTeamId: KOR, awayTeamId: 'X1', homeGoals: 2, awayGoals: 0 },
      { homeTeamId: KOR, awayTeamId: 'X2', homeGoals: 1, awayGoals: 0 },
      { homeTeamId: KOR, awayTeamId: 'X3', homeGoals: 1, awayGoals: 1 }, // 무승부로 연승 끊김
    ]
    const news = generateSeasonNews({ playedMatches: played }, 20)
    expect(news.some((n) => n.category === 'streakWin')).toBe(false)
  })

  it('결정론적: 같은 입력 → 같은 결과', () => {
    const input: SeasonNewsInput = { wcChampion: BRA, wcYear: 2026, liveRanking: [liveRow(KOR, 15), liveRow(JPN, -20)] }
    const a = generateSeasonNews(input)
    const b = generateSeasonNews(input)
    expect(a.map((n) => n.id)).toEqual(b.map((n) => n.id))
  })

  it('내 팀 관련 헤드라인이 상단으로 부스트된다(G5)', () => {
    // KOR(+11)이 BRA(+12)보다 계단은 낮지만, 내 팀 부스트로 더 위에 온다.
    const news = generateSeasonNews({ liveRanking: [liveRow(BRA, 12), liveRow(KOR, 11)], myTeamId: KOR }, 10)
    const ki = news.findIndex((n) => n.teamIds[0] === KOR)
    const bi = news.findIndex((n) => n.teamIds[0] === BRA)
    expect(ki).toBeGreaterThanOrEqual(0)
    expect(ki).toBeLessThan(bi)
  })

  it('내 팀 본선 진출 마일스톤을 낸다(G5)', () => {
    const qr = { hosts: [], qualified48: [KOR], interConfed: { winners: [] }, byConfederation: { AFC: { standings: [KOR] } } }
    const news = generateSeasonNews({ qualResult: qr as never, qualComplete: true, myTeamId: KOR }, 10)
    const m = news.find((n) => n.category === 'myTeam')
    expect(m).toBeTruthy()
    expect(m!.headline).toContain('본선 진출 확정')
    expect(news[0].category).toBe('myTeam') // 최상단
  })

  it('limit을 초과하지 않고 중요도 내림차순으로 정렬된다', () => {
    const rows = ALL_NATIONS.slice(0, 30).map((n, i) => liveRow(n.id, 11 + i))
    const news = generateSeasonNews({ wcChampion: BRA, liveRanking: rows }, 5)
    expect(news.length).toBe(5)
    for (let i = 1; i < news.length; i++) {
      expect(news[i - 1].importance).toBeGreaterThanOrEqual(news[i].importance)
    }
  })
})
