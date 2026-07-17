import { useMemo } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { useProgressStore } from '../../store/useProgressStore'
import { useContinentalHistoryStore } from '../../store/useContinentalHistoryStore'
import { useCareerStore } from '../../store/useCareerStore'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useDrawStore } from '../../store/useDrawStore'
import { formatKoreanDate } from '../../data/calendar'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { buildSeasonTimeline } from '../../engine/season/seasonTimeline'
import { useMyTeamFixtures } from './useMyTeamFixtures'
import type { CupId } from '../../data/continental/formats'
import type { Confederation } from '../../types/team'

function fmtYmd(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}.${Number(m)}.${Number(d)}`
}

/**
 * 캘린더 탭의 '내 팀 경기 일정'. 내 팀이 설정돼 있을 때, 내 팀이 참가하는 대회 + 치른/치를 경기를 날짜와
 * 함께 보여준다. 월드컵 본선 경기는 클릭 시 경기 상세(모달), 대륙컵 경기는 해당 대회 실황 페이지로 이동.
 */
export function MyTeamSchedule({ teamId, onSelectCup }: { teamId: string; onSelectCup: (id: CupId, year: number) => void }) {
  const wcYear = useCareerStore((s) => s.year)
  const progressPhase = useProgressStore((s) => s.phase)
  const cupEditions = useContinentalHistoryStore((s) => s.editions)
  const qualResult = useQualificationStore((s) => s.result)
  const drawComplete = useDrawStore((s) => s.isComplete && s.fieldTeams != null)

  // 내 팀이 이번 사이클에 참가하는 대회 일정(월드컵 + 소속 연맹 대륙컵) — 경기가 없어도 항상 표시.
  // 월드컵은 예선 진행/본선 진출·탈락 상태를 함께 보여준다(F4). 진출·탈락은 스포일러 방지를 위해 조추첨이
  // 끝난 뒤(예선 실제 종료)에만 확정 표기하고, 그전엔 '예선 진행 중'으로 둔다.
  const myConfed = ALL_NATIONS_BY_ID[teamId]?.confederation
  const myTournaments = useMemo(() => {
    const wcStatus = (): { label: string; tone: string } => {
      if (progressPhase === 'complete') return { label: '본선 종료', tone: 'text-emerald-300' }
      if (drawComplete) return qualResult?.qualified48.includes(teamId) ? { label: '본선 진출', tone: 'text-emerald-300' } : { label: '예선 탈락', tone: 'text-red-300' }
      if (qualResult) return { label: '예선 진행 중', tone: 'text-amber-300' }
      return { label: '예정', tone: 'text-gray-500' }
    }
    return buildSeasonTimeline(wcYear)
      .filter((e) => e.kind === 'wc' || (myConfed != null && (e.confeds === 'ALL' || (e.confeds as Confederation[]).includes(myConfed))))
      .map((e) => {
        if (e.kind === 'wc') return { e, status: wcStatus() }
        const done = cupEditions.some((x) => x.cupId === e.id && x.year === e.year)
        return { e, status: done ? { label: '✅ 완료', tone: 'text-emerald-300' } : { label: '예정', tone: 'text-gray-500' } }
      })
  }, [wcYear, myConfed, progressPhase, cupEditions, qualResult, drawComplete, teamId])

  const fixtures = useMyTeamFixtures(teamId, onSelectCup)

  return (
    <GlassCard className="p-4">
      <h3 className="mb-2 text-sm font-bold text-sky-300">⭐ 내 팀 <TeamLink teamId={teamId} /> 일정</h3>

      {/* 내 팀이 참가하는 대회 일정(경기 전에도 항상 표시) */}
      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-bold text-gray-400">참가 대회 ({wcYear} 시즌)</p>
        <div className="space-y-1">
          {myTournaments.map(({ e, status }) => (
            <div key={`${e.id}-${e.year}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">
              <span className="w-20 shrink-0 tabular-nums text-[10px] text-gray-400">{fmtYmd(e.start)}</span>
              <span className="min-w-0 flex-1 font-medium text-gray-200">{e.kind === 'wc' ? '🏆 ' : '🌍 '}{e.nameKo} <span className="text-gray-500">{e.year}</span></span>
              <span className={`shrink-0 text-[10px] font-bold ${status.tone}`}>{status.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 내 팀 경기(대회 진행 시) */}
      <p className="mb-1.5 text-[11px] font-bold text-gray-400">경기 일정</p>
      {fixtures.length === 0 ? (
        <p className="text-[11px] text-gray-500">아직 치르거나 예정된 경기가 없습니다. 대회가 진행되면 내 팀의 경기가 여기에 표시됩니다. (경기를 누르면 상세가 열립니다)</p>
      ) : (
        <div className="space-y-1.5">
          {fixtures.map((f) => (
            <button
              key={f.key}
              onClick={f.onClick}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/15 ${f.comp === 'wc' ? 'bg-emerald-500/10' : 'bg-violet-500/10'}`}
            >
              <span className="w-16 shrink-0 tabular-nums text-[10px] text-gray-400">{f.date ? formatKoreanDate(f.date) : '미정'}</span>
              <span className="w-24 shrink-0 text-[10px] text-gray-400">{f.comp === 'wc' ? '🏆' : '🌍'} {f.roundLabel}</span>
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <span className="text-gray-500">vs</span>
                {f.opponentId ? <TeamLink teamId={f.opponentId} wrap className="min-w-0" /> : <span className="text-gray-500">TBD</span>}
              </span>
              {f.score ? (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${f.result === 'W' ? 'bg-emerald-500/20 text-emerald-300' : f.result === 'L' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-gray-300'}`}>{f.score}</span>
              ) : (
                <span className="shrink-0 text-[10px] text-gray-500">{f.comp === 'cup' ? '실황 ›' : '예정 ›'}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
