import { useMemo } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { useCareerStore } from '../../store/useCareerStore'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { buildSeasonTimeline } from '../../engine/season/seasonTimeline'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import type { CupId } from '../../data/continental/formats'
import type { Confederation } from '../../types/team'

function fmtYmd(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}.${Number(m)}.${Number(d)}`
}

/**
 * 시즌 홈(캘린더). 이번 월드컵 사이클의 월드컵 + 6개 대륙컵을 개최 순서로 한눈에 보여주고, 눌러서 바로 진입한다.
 * 감사 E 권장 '캘린더 홈' — 기존 탭/월드컵 게이팅을 건드리지 않는 additive 진입점. 내 팀의 다음 대회도 강조.
 */
export function SeasonHome({ onSelectCup, onNavigateWC }: { onSelectCup: (id: CupId, year: number) => void; onNavigateWC: () => void }) {
  const wcYear = useCareerStore((s) => s.year)
  const hostIds = useCareerStore((s) => s.hostIds)
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const events = useMemo(() => buildSeasonTimeline(wcYear), [wcYear])
  const myConfed = myTeamId ? ALL_NATIONS_BY_ID[myTeamId]?.confederation : undefined

  // 내 팀이 참가 가능한 대회(월드컵 = 전 대륙 / 대륙컵 = 소속 연맹).
  const myEvents = useMemo(
    () => (myConfed ? events.filter((e) => e.confeds === 'ALL' || (e.confeds as Confederation[]).includes(myConfed)) : []),
    [events, myConfed],
  )

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">🗓 {wcYear} 시즌</p>
        <p className="text-xs text-gray-400">
          이번 월드컵 사이클의 월드컵과 6개 대륙컵 일정입니다. 대회를 눌러 바로 진입하세요.
          {hostIds.length > 0 && <> 개최국: {hostIds.map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join(', ')}.</>}
        </p>
      </GlassCard>

      {myTeamId && myEvents.length > 0 && (
        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-bold text-sky-300">⭐ 내 팀 <TeamLink teamId={myTeamId} /> 의 대회</h3>
          <div className="space-y-1.5">
            {myEvents.map((e) => (
              <button
                key={`${e.id}-${e.year}`}
                onClick={() => (e.kind === 'wc' ? onNavigateWC() : onSelectCup(e.id as CupId, e.year))}
                className="flex w-full items-center gap-2 rounded-lg bg-sky-500/10 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-sky-500/20"
              >
                <span className="w-24 shrink-0 tabular-nums text-[11px] text-gray-400">{fmtYmd(e.start)}</span>
                <span className="min-w-0 flex-1 font-medium text-sky-100">{e.kind === 'wc' ? '🏆 ' : '🌍 '}{e.nameKo} <span className="text-gray-500">{e.year}</span></span>
                <span className="shrink-0 text-[10px] text-sky-300/70">진입 ›</span>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <h3 className="mb-1 text-sm font-bold text-gray-200">전체 일정</h3>
        <p className="mb-3 text-[11px] text-gray-500">월드컵과 대륙컵은 서로 다른 시기에 열려 같은 팀의 경기가 겹치지 않습니다.</p>
        <div className="space-y-1.5">
          {events.map((e) => (
            <button
              key={`${e.id}-${e.year}`}
              onClick={() => (e.kind === 'wc' ? onNavigateWC() : onSelectCup(e.id as CupId, e.year))}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/15 ${e.kind === 'wc' ? 'bg-emerald-500/10' : 'bg-white/5'}`}
            >
              <span className="w-24 shrink-0 tabular-nums text-[11px] text-gray-400">{fmtYmd(e.start)}</span>
              <span className={`min-w-0 flex-1 font-medium ${e.kind === 'wc' ? 'text-emerald-200' : 'text-gray-200'}`}>{e.kind === 'wc' ? '🏆 ' : '🌍 '}{e.nameKo} <span className="text-gray-500">{e.year}</span></span>
              <span className="shrink-0 text-[10px] text-gray-500">{e.confeds === 'ALL' ? '전 대륙' : e.confeds.join('/')} ›</span>
            </button>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}
