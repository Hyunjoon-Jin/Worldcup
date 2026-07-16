import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { useCareerStore } from '../../store/useCareerStore'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { useSeasonStore } from '../../store/useSeasonStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useDrawStore } from '../../store/useDrawStore'
import { useContinentalHistoryStore } from '../../store/useContinentalHistoryStore'
import { useContinentalStore, cupTotalStages } from '../../store/useContinentalStore'
import { useMatchDetailStore, type MatchDetailRef } from '../../store/useMatchDetailStore'
import { advanceToNextEdition, startFinalsFromQualification } from '../../store/tournamentActions'
import { autoSimulateSeasonEvent, cupRankByTeam } from '../../store/seasonActions'
import { formOffsetsFromResults } from '../../engine/qualification/ranking'
import { buildSeasonTimeline, type SeasonEvent } from '../../engine/season/seasonTimeline'
import { cupStageReveal, cupStageLabel } from '../../engine/season/matchdaySteps'
import { CalendarView } from './CalendarView'
import { MyTeamSchedule } from './MyTeamSchedule'
import { TeamLink } from '../common/TeamLink'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { formatKoreanDate } from '../../data/calendar'
import { CUP_FORMATS, type CupId } from '../../data/continental/formats'

/** 진행 단위: 시간대별(한 킥오프 배치) / 경기일 단위(하루 전체). 사용자가 선택. */
type StepMode = 'slot' | 'day'

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

/** 방금 진행한 경기일(라운드) — 결과 목록. 클릭 시 경기 모달. */
interface RevealRow {
  key: string
  homeTeamId: string
  awayTeamId: string
  score: string
  ref: MatchDetailRef
}
interface RevealPanel {
  label: string
  rows: RevealRow[]
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
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)
  const [busy, setBusy] = useState(false)
  const [cycleProgress, setCycleProgress] = useState<CycleProgress | null>(null)
  const [reveal, setReveal] = useState<RevealPanel | null>(null)
  const [stepMode, setStepMode] = useState<StepMode>('day')

  const events = useMemo(() => buildSeasonTimeline(wcYear), [wcYear])
  const clampedCursor = Math.min(cursorIndex, events.length - 1)
  const current = events[clampedCursor]
  const enter = (e: SeasonEvent) => {
    if (e.kind === 'wc') onNavigateWC()
    else onSelectCup(e.id as CupId, e.year)
  }

  // 월드컵 이벤트의 현재 단계(예선 → 조추첨 대기 → 본선 → 종료)를 스토어 상태에서 도출한다.
  const wcPhase: WcPhase = progressPhase === 'complete' ? 'done' : drawDone ? 'finals' : qualDone ? 'drawReady' : 'qualifying'
  const WC_PHASE_LABEL: Record<WcPhase, string> = {
    qualifying: '지역예선 진행 중',
    drawReady: '예선 완료 · 조추첨 대기',
    finals: '본선 진행 중',
    done: '본선 종료',
  }

  // 진행 중인 대회(시작됐으나 종료 전) — 캘린더 밑에서 실황 페이지로 이어간다.
  const wcInProgress = qualDone && progressPhase !== 'complete'
  const cupInProgress = cupActiveId != null && cupHasResult && cupStage < cupTotalStages(cupActiveId)

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

  /** 방금 진행한 일정의 결승 경기 상세(모달)를 띄운다 — 캘린더 진행 시 '그 경기'를 보고 넘어가게 한다. */
  const openClimaxModal = (e: SeasonEvent) => {
    if (e.kind === 'wc') {
      const finalSlot = Object.values(useProgressStore.getState().knockoutSlots).find((s) => s.round === 'FINAL' && s.result)
      if (finalSlot?.result) selectMatch({ kind: 'knockout', match: finalSlot.result })
      return
    }
    // 대륙컵: 활성 대회(방금 진행한 대회)의 결승을 월드컵 녹아웃 형태로 변환해 모달로 보여준다.
    const res = useContinentalStore.getState().result
    const fin = res?.knockout.find((m) => m.round === 'FINAL')
    if (fin) {
      selectMatch({
        kind: 'knockout',
        external: true,
        match: {
          round: 'FINAL',
          slotId: fin.slotId,
          homeTeamId: fin.homeTeamId,
          awayTeamId: fin.awayTeamId,
          homeGoals: fin.result.homeGoals,
          awayGoals: fin.result.awayGoals,
          wentToPenalties: fin.result.wentToPenalties,
          winnerTeamId: fin.result.winnerTeamId,
          homePenalties: fin.result.homePenalties,
          awayPenalties: fin.result.awayPenalties,
        },
      })
    }
  }

  /**
   * 캘린더 클릭 진행 — 현재 커서부터 target 일정까지 시간 순서대로 자동 진행한다(그 사이 모든 대회가
   * 자연스럽게 진행·기록된다). 과거로는 갈 수 없고(이미 지난 일정), 대회를 임의로 건너뛸 수 없다(순서 진행).
   * 진행이 끝나면 그 일정의 결승 경기 모달을 띄우고, 마지막 일정이면 사이클을 넘겨(커리어 롤) 이어간다.
   */
  const progressToIndex = async (target: number) => {
    if (busy || target < clampedCursor) return
    const total = target - clampedCursor + 1
    setBusy(true)
    for (let k = 0; k < total; k++) {
      const idx = clampedCursor + k
      const e = events[idx]
      setCycleProgress({ done: k, total, label: `${e.nameKo} ${e.year}` })
      await yieldPaint()
      autoSimulateSeasonEvent(e)
    }
    setCycleProgress({ done: total, total, label: '마무리' })
    await yieldPaint()
    // 방금 진행한 마지막 일정의 결승 경기 모달을 띄운다(그 경기를 보고 넘어가는 흐름).
    openClimaxModal(events[target])
    if (target >= events.length - 1) {
      // 사이클의 마지막 일정까지 진행 → 커리어 롤 + 커서 리셋(다음 월드컵 사이클).
      advanceToNextEdition()
      useSeasonStore.getState().reset()
    } else {
      useSeasonStore.getState().setCursor(target + 1)
    }
    setCycleProgress(null)
    setBusy(false)
  }

  /** 캘린더(달력)에서 특정 대회 일정을 클릭 → 그 일정까지(포함) 순서대로 자동 진행(빠른 이동). */
  const progressToEvent = (eventId: string, eventYear: number) => {
    const idx = events.findIndex((e) => e.id === eventId && e.year === eventYear)
    if (idx >= 0) progressToIndex(idx)
  }

  const moveCursorNext = () => {
    if (clampedCursor >= events.length - 1) {
      advanceToNextEdition()
      useSeasonStore.getState().reset()
    } else {
      useSeasonStore.getState().setCursor(clampedCursor + 1)
    }
  }

  // 대륙컵 라운드 경기 → 결과 행(모달 ref 포함). external: 월드컵 조/브래킷 맥락 숨김.
  const cupRevealPanel = (cupId: CupId): RevealPanel => {
    const st = useContinentalStore.getState()
    const r = cupStageReveal(cupId, st.result!, st.stage)
    const rows: RevealRow[] = r.matches.map((m, i) => ({
      key: `${cupId}-${st.stage}-${i}`,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      score: `${m.homeGoals}-${m.awayGoals}${m.wentToPenalties ? ` (PK ${m.homePenalties}-${m.awayPenalties})` : ''}`,
      ref: m.round
        ? { kind: 'knockout', external: true, match: { round: m.round, slotId: `${cupId}-${m.round}-${i}`, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals, wentToPenalties: !!m.wentToPenalties, winnerTeamId: m.winnerTeamId ?? m.homeTeamId, homePenalties: m.homePenalties, awayPenalties: m.awayPenalties } }
        : { kind: 'group', external: true, match: { group: 'A', matchday: (Math.min(st.stage, 3) || 1) as 1 | 2 | 3, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals } },
    }))
    return { label: r.label, rows }
  }

  // 월드컵 본선에서 방금 진행한 배치(하루 또는 한 시간대)의 경기 결과 패널.
  const wcFinalsBatchPanel = (): RevealPanel => {
    const ps = useProgressStore.getState()
    const rows: RevealRow[] = [
      ...ps.lastDayGroupResults.map((m) => ({
        key: `g-${m.group}-${m.matchday}-${m.homeTeamId}`,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        score: `${m.homeGoals}-${m.awayGoals}`,
        ref: { kind: 'group' as const, match: m },
      })),
      ...ps.lastKnockoutResults.map((m) => ({
        key: `k-${m.slotId}`,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        score: `${m.homeGoals}-${m.awayGoals}${m.wentToPenalties ? ` (PK ${m.homePenalties}-${m.awayPenalties})` : ''}`,
        ref: { kind: 'knockout' as const, match: m },
      })),
    ]
    const dateLabel = ps.lastBatchDate ? formatKoreanDate(ps.lastBatchDate) : ''
    const slotLabel = ps.lastBatchTimeSlot ? ` · ${ps.lastBatchTimeSlot}` : ''
    const phaseLabel = ps.phase === 'complete' ? '결승 종료' : ps.phase === 'knockout' ? '녹아웃' : '조별리그'
    return { label: `🏆 FIFA 월드컵 · ${dateLabel}${slotLabel} (${phaseLabel})`, rows }
  }

  /**
   * 캘린더 상단 '다음 일정 진행' — 현재 대회를 경기일(라운드) 단위로 한 단계만 진행하고, 그 라운드의
   * 경기 결과를 화면에 보여준다(각 경기 클릭 시 모달). 한 대회를 통째로 돌리지 않는다.
   * 대륙컵: 조추첨→조별 1·2·3차전→녹아웃 라운드. 월드컵: 지역예선→조추첨→조별리그→녹아웃 라운드별.
   */
  const advanceOneStep = () => {
    if (busy || !current) return
    setBusy(true)
    const e = current
    if (e.kind === 'cup') {
      const cupId = e.id as CupId
      const cs = useContinentalStore.getState()
      const active = cs.activeCupId === cupId && cs.cupYear === e.year && cs.result != null
      if (!active) {
        cs.selectCup(cupId, e.year)
        useContinentalStore.getState().runActiveCup({ seed: `${cupId}-${e.year}`, rankByTeam: cupRankByTeam(cupId) })
        setReveal(cupRevealPanel(cupId)) // stage 0(조추첨)
      } else if (cs.stage < cupTotalStages(cupId)) {
        cs.advanceStage()
        setReveal(cupRevealPanel(cupId))
      } else {
        moveCursorNext()
        setReveal(null)
      }
    } else {
      // 월드컵: 지역예선(한 스텝) → 조추첨(한 스텝) → 본선(경기일/시간대별 한 배치씩)
      const qs = useQualificationStore.getState()
      if (!qs.result) {
        qs.simulate()
        useQualificationStore.getState().advanceQualToEnd()
        setReveal({ label: '🏆 FIFA 월드컵 · 지역예선 종료 — 본선 48개국 확정', rows: [] })
      } else if (!useDrawStore.getState().isComplete) {
        startFinalsFromQualification(qs.result.qualified48, `WC-${e.year}`, formOffsetsFromResults(qs.result))
        setReveal({ label: '🏆 FIFA 월드컵 · 본선 조추첨 완료', rows: [] })
      } else if (useProgressStore.getState().phase === 'complete') {
        moveCursorNext()
        setReveal(null)
      } else {
        // 본선: 사용자가 고른 단위로 한 배치만 진행(시간대별=한 킥오프, 경기일=하루).
        if (stepMode === 'slot') useProgressStore.getState().advanceTimeSlot()
        else useProgressStore.getState().advanceDay()
        setReveal(wcFinalsBatchPanel())
      }
    }
    setBusy(false)
  }

  /** 캘린더 상단 버튼 라벨 — 다음에 진행할 경기일(라운드). */
  const nextStepLabel = ((): string => {
    if (!current) return ''
    if (current.kind === 'cup') {
      const cupId = current.id as CupId
      const cs = useContinentalStore.getState()
      const active = cs.activeCupId === cupId && cs.cupYear === current.year && cs.result != null
      if (!active) return cupStageLabel(cupId, 0)
      if (cs.stage < cupTotalStages(cupId)) return cupStageLabel(cupId, cs.stage + 1)
      return `${CUP_FORMATS[cupId].nameKo} · 대회 종료 → 다음 일정`
    }
    if (!qualDone) return '🏆 FIFA 월드컵 · 지역예선'
    if (!drawDone) return '🏆 FIFA 월드컵 · 본선 조추첨'
    if (progressPhase !== 'complete') return '🏆 FIFA 월드컵 · 본선 경기'
    return '🏆 FIFA 월드컵 종료 → 다음 일정'
  })()

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
          달력에서 일정을 클릭하면 그때까지 시간 순서대로 진행되고, 그 사이 대회들이 자연스럽게 함께 진행됩니다. 월드컵도 캘린더 위의 한 이벤트입니다.
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

      {/* 실제 달력(월별 그리드) — 사이클 전체 일정을 라운드별 날짜로 시각화. 일정 클릭 시 그때까지 진행 */}
      <CalendarView
        wcYear={wcYear}
        currentEvent={current}
        onProgressTo={busy ? undefined : progressToEvent}
        onProgressNext={busy ? undefined : advanceOneStep}
        nextLabel={nextStepLabel}
        busy={busy}
        stepMode={stepMode}
        onStepModeChange={setStepMode}
      />

      {/* 방금 진행한 경기일(라운드) 결과 — 각 경기 클릭 시 상세 모달 */}
      {reveal && (
        <GlassCard className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-emerald-200">🎬 {reveal.label}</h3>
            <button onClick={() => setReveal(null)} className="text-[11px] text-gray-500 hover:text-gray-300">닫기</button>
          </div>
          {reveal.rows.length === 0 ? (
            <p className="text-[11px] text-gray-500">이 단계는 경기가 없습니다(조추첨/예선 결과). 계속 진행하세요.</p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {reveal.rows.map((row) => (
                <button
                  key={row.key}
                  onClick={() => selectMatch(row.ref)}
                  className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs transition-colors hover:bg-white/15"
                >
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-right"><TeamLink teamId={row.homeTeamId} reverse wrap className="min-w-0" /></span>
                  <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 font-bold tabular-nums text-white">{row.score}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1"><TeamLink teamId={row.awayTeamId} wrap className="min-w-0" /></span>
                </button>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* 진행 중인 대회 — 캘린더 밑에서 각 대회 실황 페이지로 진입 */}
      <GlassCard className="p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-200">🔴 진행 중인 대회</h3>
        {!wcInProgress && !cupInProgress ? (
          <p className="text-[11px] text-gray-500">현재 진행 중인 대회가 없습니다. 위 ‘지금 진행할 일정’에서 대회를 진행하면 여기에서 실황을 볼 수 있습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {wcInProgress && (
              <button
                onClick={onNavigateWC}
                className="flex w-full items-center gap-2 rounded-lg bg-emerald-500/10 px-2.5 py-2 text-left text-xs transition-colors hover:bg-emerald-500/20"
              >
                <span className="min-w-0 flex-1 font-medium text-emerald-100">🏆 FIFA 월드컵 <span className="text-gray-500">{wcYear}</span> · <span className="text-emerald-300/80">{WC_PHASE_LABEL[wcPhase]}</span></span>
                <span className="shrink-0 text-[11px] font-bold text-emerald-300">실황 보기 ›</span>
              </button>
            )}
            {cupInProgress && cupActiveId && (
              <button
                onClick={() => onSelectCup(cupActiveId, cupActiveYear ?? wcYear)}
                className="flex w-full items-center gap-2 rounded-lg bg-violet-500/10 px-2.5 py-2 text-left text-xs transition-colors hover:bg-violet-500/20"
              >
                <span className="min-w-0 flex-1 font-medium text-violet-100">🌍 {CUP_FORMATS[cupActiveId].nameKo} {cupActiveYear && <span className="text-gray-500">{cupActiveYear}</span>} · <span className="text-violet-300/80">진행 중</span></span>
                <span className="shrink-0 text-[11px] font-bold text-violet-300">실황 보기 ›</span>
              </button>
            )}
          </div>
        )}
      </GlassCard>

      {/* 내 팀 경기 일정 — 내 팀이 설정돼 있으면 내 팀 경기를 날짜와 함께 표시(클릭 시 경기 상세) */}
      {myTeamId && <MyTeamSchedule teamId={myTeamId} onSelectCup={onSelectCup} />}

      {/* 전체 일정 — 항목을 클릭하면 그 일정까지 순서대로 진행된다(캘린더가 진행의 축) */}
      <GlassCard className="p-4">
        <h3 className="mb-1 text-sm font-bold text-gray-200">전체 일정</h3>
        <p className="mb-3 text-[11px] text-gray-500">일정을 클릭하면 그 일정까지 시간 순서대로 자동 진행됩니다(그 사이 대회들이 함께 진행돼요). 지난 일정은 이미 진행됐습니다.</p>
        <div className="space-y-1.5">
          {events.map((e, i) => {
            const state = i < clampedCursor ? 'past' : i === clampedCursor ? 'current' : 'future'
            const clickable = !busy && state !== 'past'
            return (
              <button
                key={`${e.id}-${e.year}`}
                disabled={!clickable}
                onClick={() => clickable && progressToIndex(i)}
                title={clickable ? '이 일정까지 진행' : undefined}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                  state === 'current' ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40' : state === 'past' ? 'bg-white/5 opacity-60' : 'bg-white/5'
                } ${clickable ? 'hover:bg-white/15' : ''}`}
              >
                <span className="w-24 shrink-0 tabular-nums text-[11px] text-gray-400">{fmtYmd(e.start)}</span>
                <span className={`min-w-0 flex-1 font-medium ${state === 'past' && !isDone(e) ? 'text-gray-400' : e.kind === 'wc' ? 'text-emerald-200' : 'text-gray-200'}`}>
                  {e.kind === 'wc' ? '🏆 ' : '🌍 '}{e.nameKo} <span className="text-gray-500">{e.year}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-gray-500">
                  {isDone(e) && <span className="rounded bg-emerald-500/20 px-1 py-0.5 font-bold text-emerald-300">✅ 완료</span>}
                  {state === 'past' ? '지난 일정' : state === 'current' ? '' : ''}
                  {clickable && <span className="font-bold text-emerald-300">{state === 'current' ? '▶ 진행' : '▶ 여기까지'}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </GlassCard>
    </div>
  )
}
