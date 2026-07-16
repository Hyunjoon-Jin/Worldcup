import { useMemo } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { useCareerStore } from '../../store/useCareerStore'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { useSeasonStore } from '../../store/useSeasonStore'
import { advanceToNextEdition } from '../../store/tournamentActions'
import { buildSeasonTimeline, type SeasonEvent } from '../../engine/season/seasonTimeline'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import type { CupId } from '../../data/continental/formats'
import type { Confederation } from '../../types/team'

function fmtYmd(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}.${Number(m)}.${Number(d)}`
}

/**
 * 시즌 홈 = 앱의 진행 척추(일정 축). 모든 흐름은 월드컵이 아니라 일정을 기준으로 전진한다. 캘린더 위의
 * 이벤트(월드컵·6개 대륙컵)를 시간 순서로 하나씩 진행하며, 지금 진행할 일정을 강조한다. 월드컵은 그 위의
 * 한 이벤트일 뿐이다. 커서(useSeasonStore)가 진행 위치를 소유하고, 사이클을 다 마치면 다음 월드컵 사이클로 넘어간다.
 */
export function SeasonHome({ onSelectCup, onNavigateWC }: { onSelectCup: (id: CupId, year: number) => void; onNavigateWC: () => void }) {
  const wcYear = useCareerStore((s) => s.year)
  const hostIds = useCareerStore((s) => s.hostIds)
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const cursorIndex = useSeasonStore((s) => s.cursorIndex)
  const advance = useSeasonStore((s) => s.advance)
  const setCursor = useSeasonStore((s) => s.setCursor)

  const events = useMemo(() => buildSeasonTimeline(wcYear), [wcYear])
  const clampedCursor = Math.min(cursorIndex, events.length - 1)
  const current = events[clampedCursor]
  const myConfed = myTeamId ? ALL_NATIONS_BY_ID[myTeamId]?.confederation : undefined

  const enter = (e: SeasonEvent) => {
    if (e.kind === 'wc') onNavigateWC()
    else onSelectCup(e.id as CupId, e.year)
  }
  const myPlays = (e: SeasonEvent) => (myConfed ? e.confeds === 'ALL' || (e.confeds as Confederation[]).includes(myConfed) : false)

  return (
    <div className="flex flex-col gap-5">
      {/* 진행 척추 헤더 */}
      <GlassCard strong className="p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">🗓 {wcYear} 시즌 — 일정 진행</p>
        <p className="mb-3 text-[11px] text-gray-400">
          일정을 축으로 대회를 시간 순서대로 진행합니다. 월드컵도 캘린더 위의 한 이벤트입니다.
          {hostIds.length > 0 && <> 월드컵 개최국: {hostIds.map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join(', ')}.</>}
        </p>
        {current && (
          <div className="mx-auto max-w-md rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
            <p className="text-[11px] text-emerald-300/80">지금 진행할 일정 · {fmtYmd(current.start)}</p>
            <p className="my-1 text-base font-bold text-emerald-100">{current.kind === 'wc' ? '🏆 ' : '🌍 '}{current.nameKo} {current.year}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <GlassButton onClick={() => enter(current)}>▶ 이 일정 진행</GlassButton>
              <GlassButton variant="ghost" onClick={() => advance(events.length, advanceToNextEdition)}>⏭ 다음 일정로</GlassButton>
            </div>
          </div>
        )}
      </GlassCard>

      {/* 내 팀 관련 일정 강조 */}
      {myTeamId && (
        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-bold text-sky-300">⭐ 내 팀 <TeamLink teamId={myTeamId} /> 의 대회</h3>
          <div className="space-y-1.5">
            {events.filter(myPlays).map((e) => (
              <button
                key={`${e.id}-${e.year}`}
                onClick={() => enter(e)}
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

      {/* 전체 일정(진행 상태 표시) */}
      <GlassCard className="p-4">
        <h3 className="mb-1 text-sm font-bold text-gray-200">전체 일정</h3>
        <p className="mb-3 text-[11px] text-gray-500">지난 일정 · 진행 중 · 예정. 아무 일정이나 눌러 진입할 수 있습니다.</p>
        <div className="space-y-1.5">
          {events.map((e, i) => {
            const state = i < clampedCursor ? 'past' : i === clampedCursor ? 'current' : 'future'
            return (
              <button
                key={`${e.id}-${e.year}`}
                onClick={() => { setCursor(i); enter(e) }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/15 ${
                  state === 'current' ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40' : state === 'past' ? 'bg-white/5 opacity-60' : 'bg-white/5'
                }`}
              >
                <span className="w-24 shrink-0 tabular-nums text-[11px] text-gray-400">{fmtYmd(e.start)}</span>
                <span className={`min-w-0 flex-1 font-medium ${e.kind === 'wc' ? 'text-emerald-200' : 'text-gray-200'}`}>{e.kind === 'wc' ? '🏆 ' : '🌍 '}{e.nameKo} <span className="text-gray-500">{e.year}</span></span>
                <span className="shrink-0 text-[10px] text-gray-500">
                  {state === 'past' ? '지난 일정' : state === 'current' ? '진행 중' : e.confeds === 'ALL' ? '전 대륙' : (e.confeds as Confederation[]).join('/')} ›
                </span>
              </button>
            )
          })}
        </div>
      </GlassCard>
    </div>
  )
}
