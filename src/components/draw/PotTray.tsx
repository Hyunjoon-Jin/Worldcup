import { useMemo } from 'react'
import { getTeamsByPot } from '../../data/teams'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { GlassCard } from '../common/GlassCard'
import { FlagIcon } from '../common/FlagIcon'
import type { PotPools } from '../../engine/drawEngine'
import type { Pot } from '../../types/team'

interface PotTrayProps {
  /** 각 포트에 아직 남아있는(뽑히지 않은) 팀들. */
  pots: PotPools
  currentPot: Pot | null
  /** 이 조추첨의 포트 구성(랭킹순, 개최국 제외). 예선에서 넘어온 조추첨이면 전달된다. */
  composition?: PotPools | null
  /** 현재 대회 개최국(포트1에 함께 표시). */
  hostIds?: string[]
  /** 포트 산정에 쓴 현재 FIFA 점수(팀ID→점수). 있으면 현재 랭킹(위)을 표시한다. */
  rankPoints?: Record<string, number> | null
}

const POT_LABEL: Record<Pot, string> = { 1: '포트 1', 2: '포트 2', 3: '포트 3', 4: '포트 4' }

export function PotTray({ pots, currentPot, composition, hostIds, rankPoints }: PotTrayProps) {
  // 현재 FIFA 점수가 있으면 전 세계 순위(위)를 계산해 표시한다(최신 랭킹 반영).
  const rankMap = useMemo<Record<string, number> | null>(() => {
    if (!rankPoints) return null
    const sorted = Object.keys(rankPoints).sort((a, b) => rankPoints[b] - rankPoints[a])
    const m: Record<string, number> = {}
    sorted.forEach((id, i) => (m[id] = i + 1))
    return m
  }, [rankPoints])

  const hostSet = new Set(hostIds ?? [])
  const rankLabel = (id: string): string => (rankMap ? `${rankMap[id]}위` : `${ALL_NATIONS_BY_ID[id]?.fifaRankApprox ?? '-'}위`)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {([1, 2, 3, 4] as Pot[]).map((pot) => {
        const remainingIds = new Set(pots[pot])
        // 예선 기반 조추첨이면 이 조추첨의 실제 포트 구성을, 아니면 정적 기본 포트를 표시한다.
        const teamIds: string[] = composition
          ? [...(pot === 1 ? (hostIds ?? []) : []), ...composition[pot]]
          : getTeamsByPot(pot).map((t) => t.id)
        return (
          <GlassCard key={pot} className={`p-3 ${currentPot === pot ? 'ring-2 ring-sky-300/70' : ''}`}>
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-sky-300/90">
              <span>{POT_LABEL[pot]}</span>
              <span className="text-gray-400">{pots[pot].length}팀 남음</span>
            </div>
            <ul className="space-y-1">
              {teamIds.map((id) => {
                const team = ALL_NATIONS_BY_ID[id]
                if (!team) return null
                const isHost = hostSet.has(id) || (!composition && getTeamsByPot(pot).find((t) => t.id === id)?.isHost)
                // 남아있으면(아직 안 뽑힘) 밝게, 개최국은 사전 배치(확정), 그 외 뽑힌 팀은 흐리게/취소선.
                const remaining = remainingIds.has(id)
                const placed = !remaining && !isHost
                return (
                  <li
                    key={id}
                    className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] ${
                      placed ? 'text-gray-600 line-through opacity-40' : 'text-gray-100'
                    }`}
                  >
                    <FlagIcon iso2={team.iso2} className="h-2.5 w-3.5" />
                    <span className="truncate">{team.nameKo}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <span className="text-[9px] text-gray-500">{rankLabel(id)}</span>
                      {isHost && <span className="text-[9px] text-amber-300">개최국</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </GlassCard>
        )
      })}
    </div>
  )
}
