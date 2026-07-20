import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../data/nations'

function seedFromString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pick<T>(items: T[], seed: number, salt: number): T {
  return items[(seed + salt) % items.length]
}

/** 마지막 글자가 받침(종성)으로 끝나는지 판정한다(한글 음절이 아니면 받침 없는 것으로 취급). */
export function hasBatchim(word: string): boolean {
  const code = word.codePointAt(word.length - 1)
  if (code === undefined || code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

/** 받침 유무에 따라 조사를 골라 단어 뒤에 붙인다(예: josa('한국', '을', '를') -> '한국을'). */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  return word + (hasBatchim(word) ? withBatchim : withoutBatchim)
}

export interface UpsetArticleParams {
  winnerTeamId: string
  loserTeamId: string
  winnerGoals: number
  loserGoals: number
  isDraw: boolean
  wentToPenalties: boolean
  /** 실제 승자(또는 이변을 연출한 약체)가 경기 전 예상됐던 승률(%). 승부의 의외성을 서술하는 데 쓴다. */
  underdogForecastPct: number
  roundLabel: string
}

export interface UpsetArticle {
  headline: string
  paragraphs: string[]
}

/**
 * 이변(또는 이변급 무승부) 경기를 뉴스 기사 형태로 요약한다. 실제 API 호출이나 LLM 없이,
 * 경기 데이터(팀, 스코어, 랭킹, 경기 전 예상 승률)를 문장 템플릿에 대입해 생성한다. 같은
 * 경기를 다시 열어도 같은 기사가 나오도록(재렌더링마다 문구가 바뀌지 않도록) Math.random()
 * 대신 팀 조합·스코어로 만든 시드로 템플릿 후보 중 하나를 결정적으로 고른다.
 */
export function generateUpsetArticle(params: UpsetArticleParams): UpsetArticle {
  const winner = TEAMS_BY_ID[params.winnerTeamId]
  const loser = TEAMS_BY_ID[params.loserTeamId]
  const seed = seedFromString(
    `${params.winnerTeamId}-${params.loserTeamId}-${params.winnerGoals}-${params.loserGoals}-${params.isDraw}`,
  )
  // 랭킹은 숫자가 작을수록 강팀이므로, 이변 승자(winner)의 랭킹 숫자에서 패자의 랭킹 숫자를
  // 빼야 "몇 계단 위 강팀을 잡았는지"를 양수로 얻는다.
  const rankGap = winner.fifaRankApprox - loser.fifaRankApprox
  const scoreText = `${params.winnerGoals} - ${params.loserGoals}`
  // 승부차기로 갈린 경기는 정규시간 스코어가 곧 "승리 스코어"는 아니므로 별도로 표현한다.
  const resultText = params.wentToPenalties ? `${scoreText} 무승부 후 승부차기 승리` : `${scoreText} 승리`

  const winnerGa = josa(winner.nameKo, '이', '가')
  const winnerEun = josa(winner.nameKo, '은', '는')
  const winnerUi = `${winner.nameKo}의`
  const loserReul = josa(loser.nameKo, '을', '를')
  const loserEun = josa(loser.nameKo, '은', '는')
  const loserGwa = josa(loser.nameKo, '과', '와')
  const winnerGwa = josa(winner.nameKo, '과', '와')
  const resultReul = josa(resultText, '을', '를')

  if (params.isDraw) {
    const headlines = [
      `FIFA 랭킹 ${rankGap}계단 차이 딛고, ${winner.nameKo} ${loserGwa} 대등하게 맞서다`,
      `${winnerUi} 선전 — 강호 ${loserReul} 상대로 승점 1점 사수`,
      `아무도 예상 못한 무승부, ${winnerGwa} ${loser.nameKo} ${scoreText}`,
    ]
    const leads = [
      `${params.roundLabel}에서 나온 ${scoreText} 무승부는 이번 대회 최대 이변급 결과 중 하나로 꼽힌다.`,
      `경기 전 예상을 뒤엎은 결과였다. FIFA 랭킹에서 ${rankGap}계단이나 앞선 ${loserReul} 상대로 ${winnerGa} 승점 1점을 따냈다.`,
    ]
    const bodies = [
      `경기 전 데이터 모델은 ${winnerUi} 승리 확률을 ${params.underdogForecastPct.toFixed(1)}%로밖에 보지 않았지만, 실제 그라운드 위에서는 전혀 다른 그림이 펼쳐졌다.`,
      `종합 전력에서 크게 앞섰던 ${loserEun} 끝내 ${winnerUi} 골문을 열지 못했고, 승점을 나눠 가지는 데 만족해야 했다.`,
    ]
    const closings = [
      `이번 결과로 ${winnerEun} 자신감을, ${loserEun} 숙제를 안고 다음 경기를 준비하게 됐다.`,
      `이변까지는 아니어도, 전력차를 감안하면 충분히 놀라운 결과였다는 평가다.`,
    ]
    return {
      headline: pick(headlines, seed, 0),
      paragraphs: [pick(leads, seed, 1), pick(bodies, seed, 2), pick(closings, seed, 3)],
    }
  }

  const marginWord = !params.wentToPenalties && params.winnerGoals - params.loserGoals >= 3 ? '완패' : params.wentToPenalties ? '승부차기 접전' : '신승'
  const marginReul = josa(marginWord, '을', '를')
  const headlines = [
    `충격! ${winner.nameKo}, FIFA 랭킹 ${rankGap}계단 위 ${loserReul} 무너뜨리다`,
    `${winnerUi} 반란 — ${loser.nameKo} 상대 ${resultText}`,
    `이변의 주인공은 ${winner.nameKo}, 강호 ${loser.nameKo}에 ${marginReul} 안기다`,
  ]
  const leads = [
    `${params.roundLabel}에서 이번 대회 최대 이변이 나왔다. ${winnerGa} FIFA 랭킹에서 ${rankGap}계단이나 앞선 ${loserReul} 상대로 ${resultReul} 거뒀다.`,
    `아무도 예상하지 못한 결과였다. ${winnerGa} ${params.roundLabel}에서 강호 ${loserReul} 상대로 ${resultReul} 따냈다.`,
  ]
  const bodies = [
    `경기 전 데이터 모델은 ${winnerUi} 승리 확률을 단 ${params.underdogForecastPct.toFixed(1)}%로 예측했지만, 결과는 정반대였다.`,
    `전력상 열세로 평가받던 ${winnerEun} 경기 내내 강한 압박과 효율적인 마무리로 ${loserReul} 몰아붙였다.`,
    params.wentToPenalties
      ? `정규시간과 연장에서도 승부를 가리지 못했지만, 승부차기 끝에 ${winnerGa} 웃었다.`
      : `${loserEun} 끝내 반격의 실마리를 찾지 못한 채 씁쓸하게 그라운드를 떠났다.`,
  ]
  const closings = [
    `이번 승리로 ${winnerEun} 대회 최고의 이변 제조팀으로 떠올랐다.`,
    `축구는 각본 없는 드라마라는 말을 다시 한번 증명한 하루였다.`,
  ]
  return {
    headline: pick(headlines, seed, 0),
    paragraphs: [pick(leads, seed, 1), pick(bodies, seed, 2), pick(closings, seed, 3)],
  }
}
