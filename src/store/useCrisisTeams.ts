import { useMemo } from 'react'
import { GROUP_LETTERS } from '../data/hostSlots'
import { computeQualificationStatuses } from '../engine/qualificationStatus'
import { useDrawStore } from './useDrawStore'
import { useProgressStore } from './useProgressStore'
import { useSimulationStore } from './useSimulationStore'
import type { GroupLetter } from '../types/group'

/** 32강(조별통과) 진출 확률이 이 값 미만이면 "위기"로 표시한다. */
const CRISIS_PCT_THRESHOLD = 50

export interface CrisisInfo {
  pct: number
}

/**
 * 팀 ID → 위기 정보(현재 32강 진출 확률)의 맵. 아직 진출/탈락이 확정되지 않은(undecided) 팀 중
 * 진출 확률이 50% 미만인 팀만 "위기"로 표시한다 — 이미 진출이 확정됐거나 이미 탈락이 확정된
 * 팀은 확률이 낮거나(탈락 확정 시 0%에 수렴) 애초에 "위기"라는 표현이 맞지 않으므로 제외한다.
 */
export function useCrisisTeams(): Record<string, CrisisInfo> {
  const result = useSimulationStore((s) => s.result)
  const drawGroups = useDrawStore((s) => s.state.groups)
  const groupMatches = useProgressStore((s) => s.groupMatches)

  return useMemo(() => {
    const crisis: Record<string, CrisisInfo> = {}
    if (!result) return crisis

    const groupTeams = Object.fromEntries(
      GROUP_LETTERS.map((g) => [g, (drawGroups[g] as (string | null)[]).filter(Boolean) as string[]]),
    ) as Record<GroupLetter, string[]>
    const statusByTeam = computeQualificationStatuses(groupTeams, groupMatches)

    for (const teamId of Object.keys(result.probabilities)) {
      if (statusByTeam[teamId] !== 'undecided') continue
      const pct = result.probabilities[teamId]?.groupStagePct
      if (pct == null) continue
      if (pct < CRISIS_PCT_THRESHOLD) crisis[teamId] = { pct }
    }
    return crisis
  }, [result, drawGroups, groupMatches])
}
