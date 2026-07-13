import { useMemo } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { useProgressStore } from '../../store/useProgressStore'
import { computeTournamentStats, toStatMatches } from '../../engine/tournamentStats'
import { computeHighlights, highlightSummary } from '../../engine/highlights'
import { evaluateAchievements } from '../../engine/achievements'
import { collectTeamResults } from '../../engine/momentum'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import type { KnockoutMatch } from '../../types/match'

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-3 text-center">
      <div className="text-lg font-bold text-white tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] text-gray-400">{label}</div>
      {sub && <div className="mt-0.5 text-[10px] text-gray-500">{sub}</div>}
    </div>
  )
}

/** 대회 통계(D6)와 명장면 피드(D5)를 요약해 보여준다. 진행된 경기가 있을 때만 표시된다. */
export function TournamentSummary() {
  const groupMatches = useProgressStore((s) => s.groupMatches)
  const knockoutSlots = useProgressStore((s) => s.knockoutSlots)
  const champion = useProgressStore((s) => s.champion)
  const myTeamId = useMyTeamStore((s) => s.myTeamId)

  const { stats, highlights, achievements } = useMemo(() => {
    const koMatches = Object.values(knockoutSlots)
      .map((s) => s.result)
      .filter((r): r is KnockoutMatch => r != null)
    const statMatches = toStatMatches(groupMatches, koMatches)
    const stats = computeTournamentStats(statMatches)
    const highlights = computeHighlights(statMatches)
    const championResults = champion ? collectTeamResults(groupMatches, koMatches)[champion] ?? [] : []
    const achievements = evaluateAchievements({
      stats,
      highlights,
      matches: statMatches,
      champion,
      myTeamId,
      championResults,
    })
    return { stats, highlights, achievements }
  }, [groupMatches, knockoutSlots, champion, myTeamId])

  if (stats.totalMatches === 0) return null

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-bold text-sky-300">📊 대회 통계</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="진행 경기" value={`${stats.totalMatches}`} />
          <StatTile label="총 득점" value={`${stats.totalGoals}`} sub={`경기당 ${stats.avgGoalsPerMatch.toFixed(2)}골`} />
          <StatTile label="승부차기" value={`${stats.penaltyShootouts}`} />
          <StatTile
            label="최다 득점차"
            value={stats.biggestWin ? `${stats.biggestWin.homeGoals}-${stats.biggestWin.awayGoals}` : '-'}
            sub={stats.biggestWin?.label}
          />
        </div>
        {(stats.topScorers.length > 0 || stats.bestDefense.length > 0) && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-bold text-gray-400">⚽ 다득점 팀</p>
              <div className="space-y-1">
                {stats.topScorers.slice(0, 3).map((t) => (
                  <div key={t.teamId} className="flex items-center justify-between text-xs">
                    <TeamLink teamId={t.teamId} className="text-gray-200" flagClassName="h-2.5 w-3.5" />
                    <span className="font-bold tabular-nums text-emerald-300">{t.goals}골</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-bold text-gray-400">🛡 무실점 경기</p>
              <div className="space-y-1">
                {stats.bestDefense.slice(0, 3).map((t) => (
                  <div key={t.teamId} className="flex items-center justify-between text-xs">
                    <TeamLink teamId={t.teamId} className="text-gray-200" flagClassName="h-2.5 w-3.5" />
                    <span className="font-bold tabular-nums text-sky-300">{t.cleanSheets}경기</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      {highlights.length > 0 && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-bold text-amber-300">✨ 이번 대회 명장면</h3>
          <div className="space-y-1.5">
            {highlights.map((h, i) => {
              const s = highlightSummary(h)
              return (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">
                  <span className="shrink-0 text-sm">{s.icon}</span>
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-gray-300">
                    {s.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-gray-300">{s.text}</span>
                </div>
              )
            })}
          </div>
        </GlassCard>
      )}

      {achievements.some((a) => a.earned) && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-bold text-purple-300">
            🏆 업적 <span className="text-gray-500">({achievements.filter((a) => a.earned).length}/{achievements.length})</span>
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {achievements.map((a) => (
              <div
                key={a.id}
                title={a.desc}
                className={`rounded-lg p-2.5 text-center ${a.earned ? 'bg-purple-500/15' : 'bg-white/5 opacity-40'}`}
              >
                <div className="text-xl">{a.earned ? a.icon : '🔒'}</div>
                <div className="mt-1 text-[10px] font-medium text-gray-200">{a.title}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  )
}
