import { TEAMS_BY_ID } from '../../data/teams'
import { formatKoreanDate } from '../../data/calendar'
import { FlagIcon } from '../common/FlagIcon'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { GroupTable } from './GroupTable'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import type { GroupLetter } from '../../types/group'

interface GroupDetailPageProps {
  group: GroupLetter
  onBack: () => void
}

export function GroupDetailPage({ group, onBack }: GroupDetailPageProps) {
  const drawGroups = useDrawStore((s) => s.state.groups)
  const { schedule, groupMatches } = useProgressStore()

  const teamIds = (drawGroups[group] as (string | null)[]).filter(Boolean) as string[]
  const fixtures = (schedule?.groupMatches ?? []).filter((m) => m.group === group)
  const played = groupMatches.filter((m) => m.group === group)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <GlassButton variant="ghost" onClick={onBack}>
          ← 전체 조 보기
        </GlassButton>
        <h2 className="text-lg font-bold text-white">GROUP {group}</h2>
      </div>

      <GlassCard className="p-4">
        <GroupTable teamIds={teamIds} matches={played} />
      </GlassCard>

      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-bold text-sky-300">경기 일정 및 결과</h3>
        <div className="space-y-2">
          {fixtures.map((fx) => {
            const homeId = drawGroups[group][fx.homeSeed - 1]
            const awayId = drawGroups[group][fx.awaySeed - 1]
            if (!homeId || !awayId) return null
            const result = played.find(
              (m) => m.matchday === fx.matchday && m.homeTeamId === homeId && m.awayTeamId === awayId,
            )
            const home = TEAMS_BY_ID[homeId]
            const away = TEAMS_BY_ID[awayId]
            return (
              <div key={fx.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                <span className="w-16 shrink-0 text-xs text-gray-400">
                  MD{fx.matchday} · {formatKoreanDate(fx.date)}
                </span>
                <div className="flex flex-1 items-center justify-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <FlagIcon iso2={home.iso2} className="h-3 w-4" />
                    {home.nameKo}
                  </span>
                  {result ? (
                    <span className="rounded bg-white/10 px-2 py-0.5 font-bold text-white">
                      {result.homeGoals} - {result.awayGoals}
                    </span>
                  ) : (
                    <span className="text-gray-500">vs</span>
                  )}
                  <span className="flex items-center gap-1.5">
                    {away.nameKo}
                    <FlagIcon iso2={away.iso2} className="h-3 w-4" />
                  </span>
                </div>
                <span className="w-14 shrink-0 text-right text-xs text-gray-500">{result ? '종료' : '예정'}</span>
              </div>
            )
          })}
        </div>
      </GlassCard>
    </div>
  )
}
