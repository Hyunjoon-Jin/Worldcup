import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { useCareerStore } from '../../store/useCareerStore'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { useSeasonStore } from '../../store/useSeasonStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useDrawStore } from '../../store/useDrawStore'
import { useContinentalHistoryStore } from '../../store/useContinentalHistoryStore'
import { useContinentalStore, cupTotalStages } from '../../store/useContinentalStore'
import { advanceToNextEdition } from '../../store/tournamentActions'
import { autoSimulateSeasonEvent } from '../../store/seasonActions'
import { buildSeasonTimeline, type SeasonEvent } from '../../engine/season/seasonTimeline'
import { CalendarView } from './CalendarView'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import type { CupId } from '../../data/continental/formats'
import type { Confederation } from '../../types/team'

/** 월드컵 이벤트의 진행 단계(예선 명시화): 예선 → 조추첨 → 본선 → 종료. */
type WcPhase = 'qualifying' | 'drawReady' | 'finals' | 'done'
const WC_STEPS = ['지역예선', '조추첨', '본선', '종료'] as const
const WC_ORDER: WcPhase[] = ['qualifying', 'drawReady', 'finals', 'done']
/** 대륙컵 진행 단계(예선 명시화): 예선 → 조추첨 → 조별리그 → 녹아웃 → 종료. */
const CUP_STEPS = ['예선', '조추첨', '조별리그', '녹아웃', '종료'] as const

/** 진행 척추의 자동 진행 진행률(어떤 대회를 진행 중인지·전체 대비 몇 번째인지). */
interface CycleProgress {
  done: number
  total: number
  label: string
}

/** 단계 표시 바(예선 명시화 공용) — 현재 단계까지 강조. */
function StepBar({ steps, activeIdx }: { steps: readonly string[]; activeIdx: number }) {
  return (
    <div className="mx-auto mt-1 flex max-w-sm flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-[10px]">
      {steps.map((label, i) => (
        <span key={label} className="flex items-center gap-1">
          {i > 0 && <span className="text-emerald-400/40">›</span>}
          <span className={activeIdx >= i ? 'font-bold text-emerald-200' : 'text-emerald-300/40'}>{label}</span>
        </span>
      ))}
    </div>
  )
}

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
  // 진행 상태(일정 축에서 각 이벤트의 완료 여부·월드컵 예선/본선 단계 판단).
  const progressPhase = useProgressStore((s) => s.phase)
  const qualDone = useQualificationStore((s) => s.result != null)
  const drawDone = useDrawStore((s) => s.isComplete && s.fieldTeams != null)
  const cupEditions = useContinentalHistoryStore((s) => s.editions)
  // 대륙컵 진행 단계 표시용(활성 대회 한정 실시간 단계).
  const cupActiveId = useContinentalStore((s) => s.activeCupId)
  const cupActiveYear = useContinentalStore((s) => s.cupYear)
  const cupHasResult = useContinentalStore((s) => s.result != null)
  const cupStage = useContinentalStore((s) => s.stage)
  const [busy, setBusy] = useState(false)
  const [cycleProgress, setCycleProgress] = useState<CycleProgress | null>(null)

  const events = useMemo(() => buildSeasonTimeline(wcYear), [wcYear])
  const clampedCursor = Math.min(cursorIndex, events.length - 1)
  const current = events[clampedCursor]
  const myConfed = myTeamId ? ALL_NATIONS_BY_ID[myTeamId]?.confederation : undefined

  const enter = (e: SeasonEvent) => {
    if (e.kind === 'wc') onNavigateWC()
    else onSelectCup(e.id as CupId, e.year)
  }
  const myPlays = (e: SeasonEvent) => (myConfed ? e.confeds === 'ALL' || (e.confeds as Confederation[]).includes(myConfed) : false)

  // 월드컵 이벤트의 현재 단계(예선 → 조추첨 대기 → 본선 → 종료)를 스토어 상태에서 도출한다.
  const wcPhase: WcPhase = progressPhase === 'complete' ? 'done' : drawDone ? 'finals' : qualDone ? 'drawReady' : 'qualifying'
  const WC_PHASE_LABEL: Record<WcPhase, string> = {
    qualifying: '지역예선 진행 중',
    drawReady: '예선 완료 · 조추첨 대기',
    finals: '본선 진행 중',
    done: '본선 종료',
  }

  /** 한 이벤트가 이미 시뮬레이션(완주)됐는가 — 완료 표시·자동 진행 멱등성용. */
  const isDone = (e: SeasonEvent): boolean =>
    e.kind === 'wc' ? progressPhase === 'complete' : cupEditions.some((x) => x.cupId === e.id && x.year === e.year)

  /**
   * 이벤트의 단계 표시 정보(예선 명시화 공용). 월드컵은 예선→조추첨→본선→종료,
   * 대륙컵은 예선→조추첨→조별리그→녹아웃→종료. 대륙컵은 활성 대회일 때 실시간 stage로 단계를 도출하고,
   * 활성이 아니면 기록 여부로 종료/미진행을 판단한다.
   */
  const stepInfo = (e: SeasonEvent): { steps: readonly string[]; activeIdx: number; label: string } => {
    if (e.kind === 'wc') {
      return { steps: WC_STEPS, activeIdx: WC_ORDER.indexOf(wcPhase), label: WC_PHASE_LABEL[wcPhase] }
    }
    // 대륙컵: 활성 대회로 진행 중이면 실시간 stage로 단계를 도출.
    if (cupActiveId === e.id && cupActiveYear === e.year && cupHasResult) {
      const total = cupTotalStages(e.id as CupId)
      const idx = cupStage >= total ? 4 : cupStage >= 4 ? 3 : cupStage >= 1 ? 2 : 1
      const label = ['예선 진행 전', '조추첨', '조별리그 진행 중', '녹아웃 진행 중', '대회 종료'][idx]
      return { steps: CUP_STEPS, activeIdx: idx, label }
    }
    if (isDone(e)) return { steps: CUP_STEPS, activeIdx: 4, label: '대회 종료' }
    return { steps: CUP_STEPS, activeIdx: 0, label: '미진행' }
  }

  // 현재 일정을 자동 시뮬레이션한 뒤 다음 일정로 커서를 넘긴다(일정 축: 넘기는 일정도 결과가 남는다).
  const skipCurrent = () => {
    if (!current) return
    setBusy(true)
    autoSimulateSeasonEvent(current)
    advance(events.length, advanceToNextEdition)
    setBusy(false)
  }

  const yieldPaint = () => new Promise((r) => setTimeout(r, 24))

  /**
   * 이 사이클(현재 커서~마지막)을 전부 자동 진행하고 다음 월드컵 사이클로 넘어간다(커리어 자동 진행).
   * 진행률(어떤 대회를 진행 중인지·전체 대비 몇 번째인지)을 화면에 갱신하기 위해 이벤트마다 페인트를 양보한다.
   */
  const runAutoCycle = async () => {
    if (!window.confirm('현재 커서부터 이번 사이클의 남은 모든 일정(월드컵·대륙컵)을 자동 시뮬레이션하고 다음 월드컵 사이클로 넘어갑니다. 진행할까요?')) return
    const remaining = events.slice(clampedCursor)
    setBusy(true)
    setCycleProgress({ done: 0, total: remaining.length, label: remaining[0] ? `${remaining[0].nameKo} ${remaining[0].year}` : '' })
    await yieldPaint()
    for (let i = 0; i < remaining.length; i++) {
      const e = remaining[i]
      setCycleProgress({ done: i, total: remaining.length, label: `${e.nameKo} ${e.year}` })
      await yieldPaint()
      autoSimulateSeasonEvent(e)
    }
    setCycleProgress({ done: remaining.length, total: remaining.length, label: '사이클 마무리 · 다음 대회로' })
    await yieldPaint()
    // 사이클 종료 → 커리어 롤(연도·개최국·폼·랭킹 이월) + 커서 리셋.
    advanceToNextEdition()
    useSeasonStore.getState().reset()
    setCycleProgress(null)
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 진행 척추 헤더 */}
      <GlassCard strong className="p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">🗓 {wcYear} 시즌 캘린더 — 일정 진행</p>
        <p className="mb-3 text-[11px] text-gray-400">
          캘린더를 시간 순서대로 진행하면 대회가 다가옵니다. 대회를 임의로 고를 수 없고, 다가온 일정만 진행합니다. 월드컵도 캘린더 위의 한 이벤트입니다.
          {hostIds.length > 0 && <> 월드컵 개최국: {hostIds.map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join(', ')}.</>}
        </p>
        {current && (() => {
          const info = stepInfo(current)
          return (
          <div className="mx-auto max-w-md rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
            <p className="text-[11px] text-emerald-300/80">지금 진행할 일정 · {fmtYmd(current.start)}</p>
            <p className="my-1 text-base font-bold text-emerald-100">{current.kind === 'wc' ? '🏆 ' : '🌍 '}{current.nameKo} {current.year}</p>
            {/* 예선 명시화: 월드컵·대륙컵 모두 예선→…→종료 단계를 캘린더 위에 드러낸다. */}
            <StepBar steps={info.steps} activeIdx={info.activeIdx} />
            <p className="mt-0.5 text-[10px] text-emerald-300/70">{info.label}</p>
            {cycleProgress ? (
              // 자동 진행 진행률 — 현재 진행 대회 + 전체 대비 진척도.
              <div className="mx-auto mt-3 max-w-xs">
                <div className="mb-1 flex items-center justify-between text-[10px] text-emerald-200">
                  <span>⏩ 자동 진행 중 · {cycleProgress.label}</span>
                  <span className="tabular-nums">{cycleProgress.done}/{cycleProgress.total}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-emerald-900/40">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-[width]"
                    style={{ width: `${cycleProgress.total ? (cycleProgress.done / cycleProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <GlassButton onClick={() => enter(current)}>▶ 이 일정 진행</GlassButton>
                  <GlassButton variant="ghost" disabled={busy} onClick={skipCurrent}>⏭ 자동 진행 후 다음 일정로</GlassButton>
                </div>
                <button
                  disabled={busy}
                  onClick={runAutoCycle}
                  className="mt-2 text-[11px] text-emerald-300/70 underline-offset-2 hover:text-emerald-200 hover:underline disabled:opacity-50"
                >
                  ⏩ 이 사이클 전부 자동 진행 (커리어 다음 대회로)
                </button>
              </>
            )}
          </div>
          )
        })()}
      </GlassCard>

      {/* 실제 달력(월별 그리드) — 사이클 전체 일정을 라운드별 날짜로 시각화 */}
      <CalendarView wcYear={wcYear} currentEvent={current} />

      {/* 내 팀 관련 일정(진행 상태 표시 — 캘린더 축이므로 임의 진입 불가) */}
      {myTeamId && (
        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-bold text-sky-300">⭐ 내 팀 <TeamLink teamId={myTeamId} /> 의 대회</h3>
          <div className="space-y-1.5">
            {events.filter(myPlays).map((e) => {
              const idx = events.indexOf(e)
              const state = idx < clampedCursor ? 'past' : idx === clampedCursor ? 'current' : 'future'
              return (
                <div
                  key={`${e.id}-${e.year}`}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                    state === 'current' ? 'bg-sky-500/20 ring-1 ring-sky-400/40' : 'bg-sky-500/10'
                  } ${state === 'past' ? 'opacity-60' : ''}`}
                >
                  <span className="w-24 shrink-0 tabular-nums text-[11px] text-gray-400">{fmtYmd(e.start)}</span>
                  <span className="min-w-0 flex-1 font-medium text-sky-100">{e.kind === 'wc' ? '🏆 ' : '🌍 '}{e.nameKo} <span className="text-gray-500">{e.year}</span></span>
                  <span className="shrink-0 text-[10px] text-sky-300/70">
                    {state === 'past' ? (isDone(e) ? '✅ 완료' : '지난 일정') : state === 'current' ? '지금 진행' : '예정'}
                  </span>
                </div>
              )
            })}
          </div>
        </GlassCard>
      )}

      {/* 전체 일정(진행 상태 표시 — 캘린더대로 순서대로만 진행) */}
      <GlassCard className="p-4">
        <h3 className="mb-1 text-sm font-bold text-gray-200">전체 일정</h3>
        <p className="mb-3 text-[11px] text-gray-500">캘린더는 시간 순서대로만 진행됩니다. 대회를 임의로 고를 수 없고, 다가온 일정(위의 ‘지금 진행할 일정’)만 진행할 수 있습니다.</p>
        <div className="space-y-1.5">
          {events.map((e, i) => {
            const state = i < clampedCursor ? 'past' : i === clampedCursor ? 'current' : 'future'
            return (
              <div
                key={`${e.id}-${e.year}`}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                  state === 'current' ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40' : state === 'past' ? 'bg-white/5 opacity-60' : 'bg-white/5'
                }`}
              >
                <span className="w-24 shrink-0 tabular-nums text-[11px] text-gray-400">{fmtYmd(e.start)}</span>
                <span className={`min-w-0 flex-1 font-medium ${state === 'future' ? 'text-gray-400' : e.kind === 'wc' ? 'text-emerald-200' : 'text-gray-200'}`}>
                  {state === 'future' ? '🔒 ' : e.kind === 'wc' ? '🏆 ' : '🌍 '}{e.nameKo} <span className="text-gray-500">{e.year}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-gray-500">
                  {isDone(e) && <span className="rounded bg-emerald-500/20 px-1 py-0.5 font-bold text-emerald-300">✅ 완료</span>}
                  {state === 'past' ? '지난 일정' : state === 'current' ? '▶ 진행 중' : '예정'}
                </span>
              </div>
            )
          })}
        </div>
      </GlassCard>
    </div>
  )
}
