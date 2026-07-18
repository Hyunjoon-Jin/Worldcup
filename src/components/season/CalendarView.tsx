import { useEffect, useMemo, useRef, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { FlagIcon } from '../common/FlagIcon'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { buildCycleCalendar, type SeasonEvent } from '../../engine/season/seasonTimeline'
import type { MyFixture } from './useMyTeamFixtures'

const WD = ['일', '월', '화', '수', '목', '금', '토']

/** 대회별 색상(월드컵 emerald, 대륙컵은 대회별 팔레트) — 달력 점·범례 공용. */
const EVENT_COLOR: Record<string, string> = {
  WC: 'bg-emerald-400',
  EURO: 'bg-sky-400',
  COPA: 'bg-amber-400',
  AFCON: 'bg-orange-400',
  ASIAN: 'bg-rose-400',
  GOLD: 'bg-violet-400',
  OFC: 'bg-teal-400',
}
const pad = (n: number) => String(n).padStart(2, '0')
/** 'YYYY-MM' 키. */
const ymKey = (iso: string) => iso.slice(0, 7)
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate() // m: 1-based
const firstWeekday = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
const wdOf = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay()

/**
 * 캘린더 탭의 실제 달력(월별 그리드). 한 월드컵 사이클의 모든 대회를 라운드별 날짜로 펼쳐(월드컵+6개 대륙컵),
 * 각 날짜에 어떤 대회의 어떤 라운드가 열리는지 점으로 표시한다. 달력 아래에는 그 달의 일정을 목록으로 보여준다.
 * 대회를 임의로 고를 수는 없고(캘린더 축), 순수 표시용이다. 기본 표시 월은 지금 진행할 일정의 달이다.
 */
export function CalendarView({
  wcYear,
  currentEvent,
  myTeamId,
  myFixtures,
  focusDate,
}: {
  wcYear: number
  currentEvent?: SeasonEvent
  /** 내 팀(설정 시) — 캘린더에 내 팀 경기를 별도 표시. */
  myTeamId?: string
  myFixtures?: MyFixture[]
  /** 진행 위치 날짜(기본 표시 월·오늘 표시). 예선 중이면 그 예선 경기일. 없으면 현재 이벤트 시작일. */
  focusDate?: string
}) {
  const phases = useMemo(() => buildCycleCalendar(wcYear), [wcYear])
  // 일정이 있는 월만 네비게이션 대상(사이클 내 빈 달은 건너뛴다).
  const months = useMemo(() => [...new Set(phases.map((p) => ymKey(p.start)))].sort(), [phases])
  const focusIso = focusDate ?? currentEvent?.start
  const focusMonth = focusIso ? ymKey(focusIso) : undefined
  const defaultMonth = (focusMonth && months.includes(focusMonth) ? focusMonth : months[0]) ?? `${wcYear}-06`
  const [month, setMonth] = useState(defaultMonth)

  // 진행에 따라 캘린더가 '현재 날짜'를 따라간다(F2). focus 월이 바뀌면(=일정을 진행하면) 그 달로 스냅한다.
  // 사용자가 수동으로 달을 넘긴 것은 다음 진행 전까지 유지된다(진행하면 다시 현재 달로 복귀).
  const prevFocusMonth = useRef(focusMonth)
  useEffect(() => {
    if (focusMonth && focusMonth !== prevFocusMonth.current) {
      prevFocusMonth.current = focusMonth
      if (months.includes(focusMonth)) setMonth(focusMonth)
    }
  }, [focusMonth, months])

  const monthIdx = months.indexOf(month)
  const [yy, mm] = month.split('-').map(Number)
  const totalDays = daysInMonth(yy, mm)
  const lead = firstWeekday(yy, mm)

  // 이 달의 각 날짜 → 그 날 열리는 단계(대회·라운드).
  const byDay = useMemo(() => {
    const map = new Map<number, typeof phases>()
    for (const p of phases) {
      if (ymKey(p.start) !== month && ymKey(p.end) !== month && !(p.start.slice(0, 7) <= month && month <= p.end.slice(0, 7))) continue
      for (let d = 1; d <= totalDays; d++) {
        const iso = `${yy}-${pad(mm)}-${pad(d)}`
        if (p.start <= iso && iso <= p.end) {
          const arr = map.get(d) ?? []
          arr.push(p)
          map.set(d, arr)
        }
      }
    }
    return map
  }, [phases, month, totalDays, yy, mm])

  // 내 팀 경기: 날짜(day)별 + 이 달의 목록. 날짜 있는 경기만.
  const myByDay = useMemo<Map<number, MyFixture[]>>(() => {
    const map = new Map<number, MyFixture[]>()
    for (const f of myFixtures ?? []) {
      if (!f.date || ymKey(f.date) !== month) continue
      const d = Number(f.date.slice(8, 10))
      const arr = map.get(d) ?? []
      arr.push(f)
      map.set(d, arr)
    }
    return map
  }, [myFixtures, month])
  const myAgenda = useMemo<MyFixture[]>(
    () => (myFixtures ?? []).filter((f) => f.date && ymKey(f.date) === month).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    [myFixtures, month],
  )

  const todayIso = focusIso
  const usedEventIds = useMemo(() => [...new Set(phases.map((p) => p.eventId))], [phases])

  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)]

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-200">📅 시즌 캘린더</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => monthIdx > 0 && setMonth(months[monthIdx - 1])}
            disabled={monthIdx <= 0}
            aria-label="이전 일정 달"
            className="rounded-lg bg-white/10 px-2 py-1 text-xs text-gray-300 hover:bg-white/20 disabled:opacity-30"
          >
            ‹
          </button>
          <span className="w-28 text-center text-sm font-bold tabular-nums text-white">{yy}년 {mm}월</span>
          <button
            onClick={() => monthIdx < months.length - 1 && setMonth(months[monthIdx + 1])}
            disabled={monthIdx >= months.length - 1}
            aria-label="다음 일정 달"
            className="rounded-lg bg-white/10 px-2 py-1 text-xs text-gray-300 hover:bg-white/20 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-500">
        {WD.map((w, i) => (
          <div key={w} className={i === 0 ? 'text-rose-300/70' : i === 6 ? 'text-sky-300/70' : ''}>{w}</div>
        ))}
      </div>
      {/* 날짜 그리드 */}
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <div key={`b${i}`} className="aspect-square" />
          const iso = `${yy}-${pad(mm)}-${pad(d)}`
          const dayPhases = byDay.get(d) ?? []
          const myDay = myByDay.get(d) ?? []
          const isToday = iso === todayIso
          const wd = wdOf(iso)
          const dayTitle = [...myDay.map((f) => `${f.score ? f.score + ' ' : ''}vs ${f.opponentId ? ALL_NATIONS_BY_ID[f.opponentId]?.nameKo ?? f.opponentId : 'TBD'} · ${f.roundLabel}`), ...dayPhases.map((p) => `${p.eventNameKo} · ${p.label}`)].join('\n')
          const dayNumCls = `text-[11px] tabular-nums ${myDay.length > 0 ? 'font-bold text-amber-200' : wd === 0 ? 'text-rose-300/80' : wd === 6 ? 'text-sky-300/80' : 'text-gray-400'}`

          // 내 팀 경기가 있는 날: 날짜 칸에 상대·경기 종류·결과(또는 예정)를 직접 표시하고 클릭 시 상세로 이동.
          if (myDay.length > 0) {
            return (
              <button
                key={d}
                onClick={myDay[0].onClick}
                title={dayTitle}
                className={`flex aspect-square flex-col items-stretch gap-0.5 overflow-hidden rounded-md p-1 text-left transition-colors hover:bg-amber-400/25 ${myDay.some((f) => f.score) ? 'bg-amber-400/20' : 'bg-amber-400/10'} ring-1 ring-amber-300/40 ${isToday ? 'ring-2 ring-emerald-400/70' : ''}`}
              >
                <span className={dayNumCls}>{d}</span>
                <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                  {myDay.slice(0, 2).map((f) => {
                    const opp = f.opponentId ? ALL_NATIONS_BY_ID[f.opponentId] : null
                    const resCls = f.result === 'W' ? 'bg-emerald-500/30 text-emerald-200' : f.result === 'L' ? 'bg-red-500/30 text-red-200' : f.result === 'D' ? 'bg-white/15 text-gray-200' : ''
                    return (
                      <div key={f.key} className="flex flex-col gap-0.5 rounded bg-black/25 px-1 py-0.5">
                        <div className="flex min-w-0 items-center gap-1">
                          {opp ? <FlagIcon iso2={opp.iso2} className="h-2.5 w-3.5 shrink-0" /> : null}
                          <span className="min-w-0 flex-1 truncate text-[9px] font-medium text-amber-50">{opp?.nameKo ?? 'TBD'}</span>
                          {f.score ? (
                            <span className={`shrink-0 rounded px-1 text-[9px] font-bold tabular-nums ${resCls}`}>{f.score}</span>
                          ) : (
                            <span className="shrink-0 text-[8px] font-bold text-amber-300/80">예정</span>
                          )}
                        </div>
                        <span className="truncate text-[8px] leading-none text-amber-200/60">{f.comp === 'wc' ? '🏆' : '🌍'} {f.roundLabel}</span>
                      </div>
                    )
                  })}
                  {myDay.length > 2 && <span className="text-[8px] text-amber-300/70">+{myDay.length - 2}경기</span>}
                </div>
              </button>
            )
          }

          return (
            <div
              key={d}
              title={dayTitle}
              className={`flex aspect-square flex-col items-center justify-start rounded-md p-0.5 text-[10px] ${
                dayPhases.length > 0 ? 'bg-white/[0.07]' : 'bg-white/[0.02]'
              } ${isToday ? 'ring-1 ring-emerald-400/70' : ''}`}
            >
              <span className={dayNumCls}>{d}</span>
              {dayPhases.length > 0 && (
                <div className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">
                  {[...new Set(dayPhases.map((p) => p.eventId))].slice(0, 4).map((id) => (
                    <span key={id} className={`h-1.5 w-1.5 rounded-full ${EVENT_COLOR[id] ?? 'bg-gray-400'}`} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 내 팀 경기(설정 시) — 이 달의 내 팀 경기 목록. 클릭 시 경기 상세/대회 페이지. */}
      {myTeamId && (
        <div className="mt-3 border-t border-amber-300/20 pt-2">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-amber-300">⭐ 내 팀 <TeamLink teamId={myTeamId} /> 경기</p>
          {myAgenda.length === 0 ? (
            <p className="text-[11px] text-gray-500">이 달엔 내 팀 경기가 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {myAgenda.map((f) => (
                <button key={f.key} onClick={f.onClick} className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-white/10">
                  <span className="w-16 shrink-0 tabular-nums text-gray-400">{mm}월 {Number((f.date ?? '').slice(8, 10))}일 ({WD[wdOf(f.date!)]})</span>
                  <span className="shrink-0 text-gray-400">{f.comp === 'wc' ? '🏆' : '🌍'} {f.roundLabel}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1"><span className="text-gray-500">vs</span>{f.opponentId ? <TeamLink teamId={f.opponentId} wrap className="min-w-0" /> : <span className="text-gray-500">TBD</span>}</span>
                  {f.score ? <span className={`shrink-0 rounded px-1 py-0.5 font-bold ${f.result === 'W' ? 'bg-emerald-500/20 text-emerald-300' : f.result === 'L' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-gray-300'}`}>{f.score}</span> : <span className="shrink-0 text-[10px] text-amber-300/70">▶</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 범례 */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/10 pt-2 text-[10px] text-gray-400">
        {usedEventIds.map((id) => {
          const name = phases.find((p) => p.eventId === id)?.eventNameKo ?? id
          return (
            <span key={id} className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${EVENT_COLOR[id] ?? 'bg-gray-400'}`} />
              {name}
            </span>
          )
        })}
      </div>
    </GlassCard>
  )
}
