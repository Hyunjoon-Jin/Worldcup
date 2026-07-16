import { describe, expect, it } from 'vitest'
import { cupStageLabel, cupStageReveal } from '../src/engine/season/matchdaySteps'
import { runCup } from '../src/engine/continental/runCup'
import { CUP_FORMATS } from '../src/data/continental/formats'
import { cupTotalStages } from '../src/store/useContinentalStore'
import { runCupQualification } from '../src/engine/continental/cupQualification'
import { baseRatingsMap, nationsByConfederation } from '../src/data/nations'

function simEuro() {
  const f = CUP_FORMATS.EURO
  const pool = [...new Set(f.confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))]
  const qual = runCupQualification(f, baseRatingsMap(pool), [], 'STEP-EURO')
  const field = qual.qualified
  return runCup(f, field, baseRatingsMap(field), [], 'STEP-EURO')
}

describe('캘린더 경기일 단계 전개(matchdaySteps)', () => {
  it('stage 라벨: 0=조추첨, 1~3=조별 N차전, 4~=녹아웃 라운드', () => {
    expect(cupStageLabel('EURO', 0)).toContain('조추첨')
    expect(cupStageLabel('EURO', 1)).toContain('조별리그 1차전')
    expect(cupStageLabel('EURO', 3)).toContain('조별리그 3차전')
    expect(cupStageLabel('EURO', 4)).toContain('16강') // EURO 첫 녹아웃 R16
    expect(cupStageLabel('EURO', 7)).toContain('결승') // R16,QF,SF,FINAL → stage 7
  })

  it('조별 stage는 그 차전 경기만, 녹아웃 stage는 그 라운드 경기만 공개한다', () => {
    const res = simEuro()
    const md1 = cupStageReveal('EURO', res, 1)
    expect(md1.matches.length).toBeGreaterThan(0)
    expect(md1.matches.every((m) => m.round === null)).toBe(true) // 조별
    // 마지막 녹아웃 stage(결승) — 결승 경기가 포함된다
    const finalStage = cupTotalStages('EURO')
    const fin = cupStageReveal('EURO', res, finalStage)
    expect(fin.matches.some((m) => m.round === 'FINAL')).toBe(true)
  })

  it('3·4위전이 있는 대회는 결승 stage에서 3·4위전도 함께 공개된다(AFCON)', () => {
    const f = CUP_FORMATS.AFCON
    const pool = [...new Set(f.confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))]
    const qual = runCupQualification(f, baseRatingsMap(pool), [], 'STEP-AFCON')
    const res = runCup(f, qual.qualified, baseRatingsMap(qual.qualified), [], 'STEP-AFCON')
    const fin = cupStageReveal('AFCON', res, cupTotalStages('AFCON'))
    expect(fin.matches.some((m) => m.round === 'FINAL')).toBe(true)
    expect(fin.matches.some((m) => m.round === 'THIRD')).toBe(true)
  })
})
