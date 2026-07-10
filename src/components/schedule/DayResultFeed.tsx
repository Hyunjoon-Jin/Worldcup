import { TEAMS_BY_ID } from '../../data/teams'
import { FlagIcon } from '../common/FlagIcon'
import { GlassCard } from '../common/GlassCard'
import { GroupTable } from '../groups/GroupTable'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'

const ROUND_LABEL_KO: Record<string, string> = {
  R32: '32강',
  R16: '16강',
  QF: '8강',
  SF: '4강',
  THIRD: '3·4위전',
  FINAL: '결승',
}

export function DayResultFeed() {
  const drawGroups = useDrawStore((s) => s.state.groups)
  const { lastDayGroupResults, lastDeltaByGroup, groupMatches, lastKnockoutResults, phase } = useProgressStore()

  const hasGroupResults = lastDayGroupResults.length > 0
  const hasKnockoutResults = lastKnockoutResults.length > 0

  if (!hasGroupResults && !hasKnockoutResults) {
    return <GlassCard className="p-4 text-center text-sm text-gray-400">아직 진행된 경기가 없습니다. "다음 날 진행"을 눌러 시작하세요.</GlassCard>
  }

  const touchedGroups = Array.from(new Set(lastDayGroupResults.map((m) => m.group)))

  return (
    <div className="flex flex-col gap-4">
      {hasGroupResults && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-bold text-emerald-300">오늘의 경기 결과</h3>
          <div className="mb-4 space-y-1.5">
            {lastDayGroupResults.map((m, i) => {
              const home = TEAMS_BY_ID[m.homeTeamId]
              const away = TEAMS_BY_ID[m.awayTeamId]
              return (
                <div key={i} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm">
                  <span className="w-10 text-xs text-gray-500">조{m.group}</span>
                  <span className="flex flex-1 items-center justify-center gap-2">
                    <FlagIcon iso2={home.iso2} className="h-3 w-4" /> {home.nameKo}
                    <span className="rounded bg-white/10 px-2 py-0.5 font-bold text-white">
                      {m.homeGoals} - {m.awayGoals}
                    </span>
                    {away.nameKo} <FlagIcon iso2={away.iso2} className="h-3 w-4" />
                  </span>
                </div>
              )
            })}
          </div>

          <h4 className="mb-2 text-xs font-bold text-gray-400">순위 변동 (해당 조)</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {touchedGroups.map((group) => (
              <div key={group} className="rounded-lg bg-white/[0.03] p-2">
                <div className="mb-1 text-xs font-bold text-sky-300">GROUP {group}</div>
                <GroupTable
                  teamIds={(drawGroups[group] as (string | null)[]).filter(Boolean) as string[]}
                  matches={groupMatches.filter((m) => m.group === group)}
                  delta={lastDeltaByGroup[group]}
                  compact
                />
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {hasKnockoutResults && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-bold text-amber-300">
            {phase === 'complete' ? '🏆 대회 종료' : '오늘의 토너먼트 결과'}
          </h3>
          <div className="space-y-1.5">
            {lastKnockoutResults.map((m, i) => {
              const home = TEAMS_BY_ID[m.homeTeamId]
              const away = TEAMS_BY_ID[m.awayTeamId]
              return (
                <div key={i} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm">
                  <span className="w-14 text-xs text-gray-500">{ROUND_LABEL_KO[m.round]}</span>
                  <span className="flex flex-1 items-center justify-center gap-2">
                    <FlagIcon iso2={home.iso2} className="h-3 w-4" /> {home.nameKo}
                    <span className="rounded bg-white/10 px-2 py-0.5 font-bold text-white">
                      {m.homeGoals} - {m.awayGoals}
                    </span>
                    {away.nameKo} <FlagIcon iso2={away.iso2} className="h-3 w-4" />
                    {m.wentToPenalties && <span className="text-[10px] text-gray-500">(승부차기)</span>}
                  </span>
                  <span className="w-16 text-right text-xs font-bold text-emerald-300">
                    {TEAMS_BY_ID[m.winnerTeamId].nameKo} 승
                  </span>
                </div>
              )
            })}
          </div>
        </GlassCard>
      )}
    </div>
  )
}
