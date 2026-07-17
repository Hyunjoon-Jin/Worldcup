import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
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
const EVENT_TEXT: Record<string, string> = {
  WC: 'text-emerald-300',
  EURO: 'text-sky-300',
  COPA: 'text-amber-300',
  AFCON: 'text-orange-300',
  ASIAN: 'text-rose-300',
  GOLD: 'text-violet-300',
  OFC: 'text-teal-300',
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
  onProgressTo,
  onProgressNext,
  nextLabel,
  busy,
  stepMode,
  onStepModeChange,
  myTeamId,
  myFixtures,
  focusDate,
}: {
  wcYear: number
  currentEvent?: SeasonEvent
  /** 달력에서 일정을 클릭하면 그 대회 일정까지 진행한다(있을 때만 클릭 가능). */
  onProgressTo?: (eventId: string, eventYear: number) => void
  /** 캘린더 상단 '다음 일정 진행' — 현재 일정 하나를 진행한다. */
  onProgressNext?: () => void
  /** 다음(현재) 진행할 일정 라벨. */
  nextLabel?: string
  busy?: boolean
  /** 진행 단위(시간대별/경기일). */
  stepMode?: 'slot' | 'day'
  onStepModeChange?: (m: 'slot' | 'day') => void
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
  const defaultMonth = (focusIso && months.includes(ymKey(focusIso)) ? ymKey(focusIso) : months[0]) ?? `${wcYear}-06`
  const [month, setMonth] = useState(defaultMonth)

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

  // 이 달의 일정 목록(날짜순) — 시작일 기준.
  const agenda = useMemo(
    () => phases.filter((p) => ymKey(p.start) === month).sort((a, b) => a.start.localeCompare(b.start)),
    [phases, month],
  )

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
      {/* 상단: 진행 단위 선택(시간대별/경기일) + 다음 일정 진행 버튼 — 캘린더가 진행의 축. */}
      {onProgressNext && (
        <div className="mb-3">
          {onStepModeChange && (
            <div className="mb-2 flex items-center justify-center gap-1 text-[11px]">
              <span className="mr-1 text-gray-500">진행 단위:</span>
              <div className="flex rounded-lg bg-white/5 p-0.5">
                {(['slot', 'day'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => onStepModeChange(m)}
                    className={`rounded-md px-2.5 py-1 font-bold transition-colors ${stepMode === m ? 'bg-emerald-500/30 text-emerald-100' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    {m === 'slot' ? '시간대별' : '경기일 단위'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={onProgressNext}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2.5 text-sm font-bold text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {busy ? '진행 중…' : <>▶ 다음 일정 진행{nextLabel && <span className="font-normal text-emerald-300/80"> · {nextLabel}</span>}</>}
          </button>
        </div>
      )}
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
          return (
            <div
              key={d}
              title={[...myDay.map((f) => `⭐ vs ${f.opponentId ?? 'TBD'} · ${f.roundLabel}`), ...dayPhases.map((p) => `${p.eventNameKo} · ${p.label}`)].join('\n')}
              className={`flex aspect-square flex-col items-center justify-start rounded-md p-0.5 text-[10px] ${
                myDay.length > 0 ? 'bg-amber-400/15 ring-1 ring-amber-300/40' : dayPhases.length > 0 ? 'bg-white/[0.07]' : 'bg-white/[0.02]'
              } ${isToday ? 'ring-1 ring-emerald-400/70' : ''}`}
            >
              <span className={`tabular-nums ${myDay.length > 0 ? 'font-bold text-amber-200' : wd === 0 ? 'text-rose-300/80' : wd === 6 ? 'text-sky-300/80' : 'text-gray-400'}`}>{d}</span>
              {myDay.length > 0 ? (
                <span className="mt-0.5 text-[9px] leading-none text-amber-300">⭐</span>
              ) : (
                dayPhases.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">
                    {[...new Set(dayPhases.map((p) => p.eventId))].slice(0, 4).map((id) => (
                      <span key={id} className={`h-1.5 w-1.5 rounded-full ${EVENT_COLOR[id] ?? 'bg-gray-400'}`} />
                    ))}
                  </div>
                )
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

      {/* 이 달의 일정 목록(라운드별 날짜) */}
      <div className="mt-3 border-t border-white/10 pt-2">
        {agenda.length === 0 ? (
          <p className="text-[11px] text-gray-500">이 달에는 시작하는 일정이 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {agenda.map((p) => {
              const row = (
                <>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${EVENT_COLOR[p.eventId] ?? 'bg-gray-400'}`} />
                  <span className="w-16 shrink-0 tabular-nums text-gray-400">{mm}월 {Number(p.start.slice(8, 10))}일 ({WD[wdOf(p.start)]})</span>
                  <span className={`shrink-0 font-medium ${EVENT_TEXT[p.eventId] ?? 'text-gray-200'}`}>{p.eventKind === 'wc' ? '🏆' : '🌍'} {p.eventNameKo}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-400">{p.label}</span>
                </>
              )
              return onProgressTo ? (
                <button
                  key={`${p.eventId}-${p.key}`}
                  onClick={() => onProgressTo(p.eventId, p.eventYear)}
                  title="이 일정까지 진행"
                  className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-white/10"
                >
                  {row}
                  <span className="shrink-0 text-[10px] font-bold text-emerald-300">▶</span>
                </button>
              ) : (
                <div key={`${p.eventId}-${p.key}`} className="flex items-center gap-2 px-1 text-[11px]">{row}</div>
              )
            })}
          </div>
        )}
      </div>

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
