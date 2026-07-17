import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
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
import { buildQualCalendar, qualWindowDate } from '../../engine/qualification/calendar'
import { buildSeasonTimeline, type SeasonEvent } from '../../engine/season/seasonTimeline'
import { cupStageReveal, cupStageLabel } from '../../engine/season/matchdaySteps'
import { CalendarView } from './CalendarView'
import { MyTeamSchedule } from './MyTeamSchedule'
import { useMyTeamFixtures } from './useMyTeamFixtures'
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
  // 내 팀 경기(날짜 포함) — 캘린더 그리드/일정에 내 팀 일정을 표시하기 위해.
  const myFixtures = useMyTeamFixtures(myTeamId ?? '', onSelectCup)
  const [busy, setBusy] = useState(false)
  const [cycleProgress, setCycleProgress] = useState<CycleProgress | null>(null)
  const [reveal, setReveal] = useState<RevealPanel | null>(null)
  const [stepMode, setStepMode] = useState<StepMode>('day')

  const events = useMemo(() => buildSeasonTimeline(wcYear), [wcYear])
  const clampedCursor = Math.min(cursorIndex, events.length - 1)
  const current = events[clampedCursor]

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

  // 지역예선 전역 진행 경기일(대륙 최대 라운드 기준) — QualificationStage와 동일 계산.
  const qualGlobalWindow = (): { gw: number; total: number } => {
    const qs = useQualificationStore.getState()
    if (!qs.result) return { gw: 0, total: 0 }
    const total = buildQualCalendar(qs.result, wcYear).length
    const gw = Math.min(total, Math.max(0, ...Object.keys(qs.result.byConfederation).map((c) => qs.revealed[c] ?? 0)))
    return { gw, total }
  }
  const qualAtEnd = (): boolean => {
    const qs = useQualificationStore.getState()
    if (!qs.result) return false
    const { gw, total } = qualGlobalWindow()
    return gw >= total && qs.drawPending == null
  }
  /** 지역예선 한 경기일(또는 차수 조추첨) 진행 상태 패널 — 경기 목록은 지역예선 탭에서(수백 경기라 라벨만). */
  const qualWindowPanel = (): RevealPanel => {
    const qs = useQualificationStore.getState()
    if (qs.drawPending != null) return { label: `🌍 월드컵 지역예선 · ${qs.drawPending}차 예선 조추첨`, rows: [] }
    const cal = qs.result ? buildQualCalendar(qs.result, wcYear) : []
    const { gw, total } = qualGlobalWindow()
    const day = cal[gw - 1]?.label ? ` · ${cal[gw - 1].label}` : ''
    return { label: `🌍 월드컵 지역예선 · 경기일 ${gw}/${total}${day}`, rows: [] }
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
      // 월드컵: 지역예선(경기일별) → 조추첨 → 본선(경기일/시간대별 한 배치씩)
      const qs = useQualificationStore.getState()
      if (!qs.result) {
        // 예선 시작 — 첫 경기일 공개.
        qs.simulate()
        setReveal(qualWindowPanel())
      } else if (!qualAtEnd()) {
        // 지역예선을 '한 경기일'만 진행(차수 사이엔 예선 조추첨을 먼저 보여준다). 전체 한 번에 진행하지 않는다.
        useQualificationStore.getState().advanceQual()
        setReveal(qualWindowPanel())
      } else if (!useDrawStore.getState().isComplete) {
        startFinalsFromQualification(qs.result.qualified48, `WC-${e.year}`, formOffsetsFromResults(qs.result))
        setReveal({ label: '🏆 FIFA 월드컵 · 본선 조추첨 완료 — 32강 대진 확정', rows: [] })
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

  // 캘린더 기준 날짜(진행 위치) — 월드컵 예선 중엔 그 예선 경기일, 그 외엔 현재 이벤트 시작일.
  // 예선부터 캘린더가 시작되도록(사용자 지적) 예선 창 날짜를 기준으로 삼는다.
  const focusDate = current
    ? current.kind === 'wc' && !qualDone
      ? qualWindowDate(Math.max(0, qualGlobalWindow().gw - 1), wcYear)
      : current.start
    : undefined

  return (
    <div className="flex flex-col gap-5">
      {/* 진행 척추 헤더 = 상단 고정 진행 바. 날짜(경기일)/시간대 단위 진행 버튼을 항상 화면 상단에 둔다. */}
      <GlassCard strong className="sticky top-16 z-[9] p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <p className="text-sm font-semibold text-white">🗓 {wcYear} 시즌 · 일정 진행</p>
          {hostIds.length > 0 && (
            <p className="text-[10px] text-gray-500">개최국 {hostIds.map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join('·')}</p>
          )}
        </div>
        {current && (() => {
          const info = stepInfo(current)
          return (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <p className="text-sm font-bold text-emerald-100">{current.kind === 'wc' ? '🏆 ' : '🌍 '}{current.nameKo} {current.year}</p>
              <p className="text-[10px] text-emerald-300/80">{fmtYmd(focusDate ?? current.start)} · {info.label}</p>
            </div>
            {/* 예선 명시화: 월드컵·대륙컵 모두 예선→…→종료 단계를 상단에 드러낸다. */}
            <StepBar steps={info.steps} activeIdx={info.activeIdx} />
            {cycleProgress ? (
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between text-[10px] text-emerald-200">
                  <span className="truncate">⏩ 진행 중 · {cycleProgress.label}</span>
                  <span className="tabular-nums">{cycleProgress.done}/{cycleProgress.total}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-emerald-900/40">
                  <div className="h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${cycleProgress.total ? (cycleProgress.done / cycleProgress.total) * 100 : 0}%` }} />
                </div>
              </div>
            ) : (
              // 상단 진행 컨트롤: 진행 단위(시간대별/경기일) 선택 + 다음 일정 진행 버튼.
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center justify-center gap-1 text-[11px]">
                  <span className="mr-0.5 text-emerald-300/70">진행 단위</span>
                  <div className="flex rounded-lg bg-black/20 p-0.5">
                    {(['slot', 'day'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setStepMode(m)}
                        className={`rounded-md px-2.5 py-1 font-bold transition-colors ${stepMode === m ? 'bg-emerald-500/40 text-emerald-50' : 'text-emerald-300/60 hover:text-emerald-200'}`}
                      >
                        {m === 'slot' ? '시간대별' : '경기일 단위'}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={advanceOneStep}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/25 px-3 py-2 text-sm font-bold text-emerald-50 transition-colors hover:bg-emerald-500/35 disabled:opacity-50"
                >
                  {busy ? '진행 중…' : <>▶ 다음 일정 진행{nextStepLabel && <span className="hidden font-normal text-emerald-200/80 sm:inline"> · {nextStepLabel}</span>}</>}
                </button>
              </div>
            )}
          </div>
          )
        })()}
      </GlassCard>

      {/* 실제 달력(월별 그리드) — 사이클 전체 일정을 라운드별 날짜로 시각화. 일정 클릭 시 그때까지 진행.
          진행 버튼은 상단 고정 바로 옮겼으므로 여기서는 표시/일정 클릭만 담당한다. */}
      <CalendarView
        wcYear={wcYear}
        currentEvent={current}
        onProgressTo={busy ? undefined : progressToEvent}
        myTeamId={myTeamId ?? undefined}
        myFixtures={myFixtures}
        focusDate={focusDate}
      />

      {/* 방금 진행한 경기일(라운드) 결과 — 각 경기 클릭 시 상세 모달 */}
      {reveal && (
        <GlassCard className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-emerald-200">🎬 {reveal.label}</h3>
            <button onClick={() => setReveal(null)} className="text-[11px] text-gray-500 hover:text-gray-300">닫기</button>
          </div>
          {reveal.rows.length === 0 ? (
            <p className="text-[11px] text-gray-500">조추첨/예선 진행 단계입니다. 경기 상세는 ‘지역예선’·해당 대회 탭에서 볼 수 있어요. ▶ 로 계속 진행하세요.</p>
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
