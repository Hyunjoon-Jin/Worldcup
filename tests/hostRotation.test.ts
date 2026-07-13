import { describe, expect, it } from 'vitest'
import { HOST_ROTATION, hostEditionAt } from '../src/data/hostRotation'

describe('개최국 로테이션 — 연속 개최 방지', () => {
  it('순환 경계를 포함해 인접 두 대회가 같은 나라를 개최하지 않는다', () => {
    const n = HOST_ROTATION.length
    for (let i = 0; i < n; i++) {
      const cur = new Set(HOST_ROTATION[i].hostIds)
      const next = HOST_ROTATION[(i + 1) % n].hostIds // 마지막→처음(순환) 포함
      const shared = next.filter((id) => cur.has(id))
      expect(shared, `${HOST_ROTATION[i].year}→${HOST_ROTATION[(i + 1) % n].year} 개최국 중복: ${shared}`).toEqual([])
    }
  })

  it('순환 주기는 40대회다', () => {
    expect(HOST_ROTATION.length).toBe(40)
  })

  it('실제 진행에서 순환 경계를 넘겨도(edition 0..44) 연속 대회 개최국이 겹치지 않는다', () => {
    for (let ed = 0; ed < 44; ed++) {
      const cur = new Set(hostEditionAt(ed).hostIds)
      const next = hostEditionAt(ed + 1).hostIds
      const shared = next.filter((id) => cur.has(id))
      expect(shared, `edition ${ed}→${ed + 1} 개최국 중복: ${shared}`).toEqual([])
    }
  })

  it('연도는 대회마다 4년씩 단조 증가한다(순환 경계 포함)', () => {
    for (let ed = 0; ed < 44; ed++) {
      expect(hostEditionAt(ed + 1).year - hostEditionAt(ed).year).toBe(4)
    }
  })
})
