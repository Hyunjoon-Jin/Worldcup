import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { hostEditionAt } from '../data/hostRotation'
import { setCurrentHosts } from '../engine/hostContext'

const clamp8 = (v: number) => Math.max(-8, Math.min(8, Math.round(v)))

interface CareerStore {
  /** 현재 대회 인덱스(0 = 2026). 대회를 거듭할수록 증가한다. */
  editionIndex: number
  /** 현재 대회 연도(표시용) */
  year: number
  /** 현재 대회 개최국 팀 ID */
  hostIds: string[]
  /** 대회를 이어가며 누적되는 팀별 "커리어 폼"(성적 흐름). 다음 대회 시작 전력에 반영된다. */
  carriedForm: Record<string, number>
  /** 이전 대회들에서 이월된 FIFA 랭킹 점수(팀ID→점수). 비어 있으면 정적 기본값을 쓴다.
   *  본선까지 반영된 랭킹이 다음 대회로 이어지도록(회귀하지 않도록) 유지한다. */
  rankingBase: Record<string, number>
  /** 다음 대회로 넘어간다. 방금 끝난 대회의 성적 보정(finalDeltas)을 커리어 폼에 절반 반영하고,
   *  다음 대회 개최국을 로테이션에서 선정한다. endRankingPoints가 있으면 이월 FIFA 점수로 저장한다. */
  advanceEdition: (finalDeltas: Record<string, number>, endRankingPoints?: Record<string, number>) => void
  /** 커리어를 처음(2026)으로 되돌린다. */
  reset: () => void
}

const first = hostEditionAt(0)

export const useCareerStore = create<CareerStore>()(
  persist(
    (set, get) => ({
      editionIndex: 0,
      year: first.year,
      hostIds: first.hostIds,
      carriedForm: {},
      rankingBase: {},
      advanceEdition: (finalDeltas, endRankingPoints) => {
        const { editionIndex, carriedForm, rankingBase } = get()
        // 커리어 폼 = 기존의 절반 + 이번 대회 성적의 절반(누적되되 발산하지 않도록 감쇠)
        const nextForm: Record<string, number> = { ...carriedForm }
        const ids = new Set([...Object.keys(carriedForm), ...Object.keys(finalDeltas)])
        for (const id of ids) {
          nextForm[id] = clamp8((carriedForm[id] ?? 0) * 0.5 + (finalDeltas[id] ?? 0) * 0.5)
          if (nextForm[id] === 0) delete nextForm[id]
        }
        const nextEd = hostEditionAt(editionIndex + 1)
        setCurrentHosts(nextEd.hostIds)
        set({
          editionIndex: editionIndex + 1,
          year: nextEd.year,
          hostIds: nextEd.hostIds,
          carriedForm: nextForm,
          // 본선까지 반영된 FIFA 점수를 다음 대회 시작 점수로 이월(회귀 방지).
          rankingBase: endRankingPoints ?? rankingBase,
        })
      },
      reset: () => {
        setCurrentHosts(first.hostIds)
        set({ editionIndex: 0, year: first.year, hostIds: first.hostIds, carriedForm: {}, rankingBase: {} })
      },
    }),
    {
      name: 'wc2026-career-store',
      version: 1,
      onRehydrateStorage: () => (state) => {
        // 복원된 개최국을 현재 대회 컨텍스트에 반영(홈 이점·포트·조추첨이 참조).
        if (state?.hostIds?.length) setCurrentHosts(state.hostIds)
      },
    },
  ),
)
