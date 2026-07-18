import { describe, expect, it, beforeEach } from 'vitest'
import { advanceCalendarAfterWorldCup } from '../src/store/seasonActions'
import { useSeasonStore } from '../src/store/useSeasonStore'
import { useCareerStore } from '../src/store/useCareerStore'
import { buildSeasonTimeline } from '../src/engine/season/seasonTimeline'

describe('월드컵 후 캘린더 진행(advanceCalendarAfterWorldCup)', () => {
  beforeEach(() => {
    useSeasonStore.setState({ cursorIndex: 0 } as never)
  })

  it('월드컵을 마치면 다음 사이클로 롤하지 않고 월드컵 다음 일정(대륙컵)으로 커서를 옮긴다', () => {
    const year = useCareerStore.getState().year
    const events = buildSeasonTimeline(year)
    const wcIdx = events.findIndex((e) => e.kind === 'wc')
    expect(wcIdx).toBeGreaterThanOrEqual(0)
    // 월드컵은 사이클의 마지막이 아니다(아시안컵·유로 등이 뒤에 온다).
    expect(wcIdx).toBeLessThan(events.length - 1)

    // 커서가 월드컵에 있는 상태에서 호출.
    useSeasonStore.getState().setCursor(wcIdx)
    advanceCalendarAfterWorldCup()

    // 다음 사이클로 롤(연도 변경 + 커서 0)되지 않고, 월드컵 다음 일정으로 이동.
    expect(useCareerStore.getState().year).toBe(year)
    expect(useSeasonStore.getState().cursorIndex).toBe(wcIdx + 1)
    // 다음 일정은 대륙컵이어야 한다(월드컵 지역예선이 아님).
    expect(events[wcIdx + 1].kind).toBe('cup')
  })
})
