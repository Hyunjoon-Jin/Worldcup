import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 한 시점(월/경기일)의 전체 FIFA 순위 스냅샷. */
export interface RankSnapshot {
  /** ISO 날짜(yyyy-mm-dd) */
  date: string
  /** 팀ID → 그 시점 순위 */
  rankByTeam: Record<string, number>
}

// 여러 대회(각 ~1년 예선)에 걸쳐 월별로 쌓이므로 넉넉히 보관하되 무한 증가는 막는다.
const MAX_SNAPSHOTS = 120

interface RankHistoryStore {
  snapshots: RankSnapshot[]
  /** 날짜 기준으로 스냅샷을 병합(같은 날짜는 최신으로 대체)하고 날짜순 정렬·상한 유지. */
  recordMany: (entries: RankSnapshot[]) => void
  reset: () => void
}

export const useRankHistoryStore = create<RankHistoryStore>()(
  persist(
    (set, get) => ({
      snapshots: [],
      recordMany: (entries) => {
        if (entries.length === 0) return
        const byDate = new Map(get().snapshots.map((s) => [s.date, s]))
        for (const e of entries) byDate.set(e.date, e)
        const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_SNAPSHOTS)
        set({ snapshots: merged })
      },
      reset: () => set({ snapshots: [] }),
    }),
    { name: 'wc2026-rank-history-store', version: 1 },
  ),
)

/** 월별 스냅샷에서 한 팀의 순위 이력을 뽑아 최고·최저·평균·추이를 계산한다. */
export function aggregateMonthlyRank(snapshots: RankSnapshot[], teamId: string) {
  const trend = snapshots
    .filter((s) => s.rankByTeam[teamId] != null)
    .map((s) => ({ date: s.date, rank: s.rankByTeam[teamId] }))
  if (trend.length === 0) {
    return { best: null as { date: string; rank: number } | null, worst: null as { date: string; rank: number } | null, avg: null as number | null, trend }
  }
  const best = trend.reduce((m, r) => (r.rank < m.rank ? r : m))
  const worst = trend.reduce((m, r) => (r.rank > m.rank ? r : m))
  const avg = trend.reduce((s, r) => s + r.rank, 0) / trend.length
  return { best, worst, avg, trend }
}
