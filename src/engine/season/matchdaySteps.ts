import { CUP_FORMATS, type CupId } from '../../data/continental/formats'
import type { CupResult } from '../continental/runCup'
import type { KnockoutRound } from '../../types/match'

const ROUND_LABEL: Record<KnockoutRound, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위전', FINAL: '결승' }

/** 한 경기일/라운드에서 공개되는 경기(모달 클릭용 정보 포함). */
export interface RevealedMatch {
  homeTeamId: string
  awayTeamId: string
  homeGoals: number
  awayGoals: number
  roundLabel: string
  /** 녹아웃 경기면 라운드(모달용). 조별이면 null. */
  round: KnockoutRound | null
  wentToPenalties?: boolean
  homePenalties?: number
  awayPenalties?: number
  winnerTeamId?: string
}

export interface RoundReveal {
  label: string
  matches: RevealedMatch[]
}

/** 대륙컵 stage의 라벨(경기 없이 계산). stage 0=조추첨, 1~3=조별 N차전, 4~=녹아웃 라운드. */
export function cupStageLabel(cupId: CupId, stage: number): string {
  const f = CUP_FORMATS[cupId]
  if (stage <= 0) return `${f.nameKo} · 조추첨(조편성)`
  if (stage <= 3) return `${f.nameKo} · 조별리그 ${stage}차전`
  const round = f.knockout[stage - 4]
  return round ? `${f.nameKo} · 녹아웃 ${ROUND_LABEL[round]}` : `${f.nameKo} · 대회 종료`
}

/**
 * 대륙컵의 특정 stage에서 공개되는 라운드와 경기들. stage 0=조추첨(경기 없음), 1~3=조별 N차전,
 * 4~=녹아웃 라운드(마지막 라운드에서 3·4위전 동반 공개). ContinentalStage의 단계별 공개와 동형.
 */
export function cupStageReveal(cupId: CupId, result: CupResult, stage: number): RoundReveal {
  const f = CUP_FORMATS[cupId]
  const label = cupStageLabel(cupId, stage)
  if (stage <= 0) return { label, matches: [] }
  if (stage <= 3) {
    const matches = result.groups
      .flatMap((g) => g.matches.filter((m) => m.matchday === stage))
      .map((m) => ({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals, roundLabel: `조별리그 ${stage}차전`, round: null as KnockoutRound | null }))
    return { label, matches }
  }
  const round = f.knockout[stage - 4]
  if (!round) return { label, matches: [] }
  const includeThird = round === f.knockout[f.knockout.length - 1] && f.thirdPlace
  const rounds: KnockoutRound[] = includeThird ? [round, 'THIRD'] : [round]
  const matches = result.knockout
    .filter((m) => rounds.includes(m.round))
    .map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeGoals: m.result.homeGoals,
      awayGoals: m.result.awayGoals,
      roundLabel: ROUND_LABEL[m.round],
      round: m.round,
      wentToPenalties: m.result.wentToPenalties,
      homePenalties: m.result.homePenalties,
      awayPenalties: m.result.awayPenalties,
      winnerTeamId: m.result.winnerTeamId,
    }))
  return { label, matches }
}
