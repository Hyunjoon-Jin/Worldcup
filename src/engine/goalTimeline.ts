import { createSeededRandom } from './rng'

export interface GoalEvent {
  minute: number
  teamId: string
  /** 정규시간(1~90) 이후 추가시간 골 여부 */
  stoppage: boolean
}

/**
 * 경기 스코어로부터 결정론적인 득점 타임라인을 생성한다 (C5).
 *
 * 실제 시뮬레이션은 스코어만 만들므로, 여기서는 스코어·팀 조합을 시드로 삼아 각 골의 분(minute)을
 * 재현 가능하게 배분한다(같은 경기를 다시 열어도 동일한 타임라인). 경기 결과 자체는 바꾸지 않는
 * 순수 표현용 함수다.
 */
export function generateGoalTimeline(
  homeTeamId: string,
  awayTeamId: string,
  homeGoals: number,
  awayGoals: number,
): GoalEvent[] {
  const rand = createSeededRandom(`${homeTeamId}-${awayTeamId}-${homeGoals}-${awayGoals}-timeline`)
  const events: GoalEvent[] = []

  const addGoals = (teamId: string, count: number) => {
    for (let i = 0; i < count; i++) {
      // 1~95분. 90분 초과는 추가시간으로 표기.
      const minute = 1 + Math.floor(rand() * 95)
      events.push({ minute, teamId, stoppage: minute > 90 })
    }
  }

  addGoals(homeTeamId, homeGoals)
  addGoals(awayTeamId, awayGoals)

  return events.sort((a, b) => a.minute - b.minute)
}

/** 득점 분 표기(추가시간은 90+n 형식). */
export function formatGoalMinute(e: GoalEvent): string {
  return e.stoppage ? `90+${e.minute - 90}'` : `${e.minute}'`
}
