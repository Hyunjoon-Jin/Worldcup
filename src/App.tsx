import { lazy, Suspense, useEffect, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { AppShell } from './components/layout/AppShell'
import { Header } from './components/layout/Header'
import { TabNav } from './components/layout/TabNav'
import { MatchDetailModal } from './components/common/MatchDetailModal'
import { DebugPanel } from './components/common/DebugPanel'
import { OnboardingOverlay } from './components/common/OnboardingOverlay'

// 탭별 화면은 지연 로딩해 초기 번들 크기를 줄인다 (B5).
const QualificationStage = lazy(() =>
  import('./components/qualification/QualificationStage').then((m) => ({ default: m.QualificationStage })),
)
const DrawStage = lazy(() => import('./components/draw/DrawStage').then((m) => ({ default: m.DrawStage })))
const ScheduleStage = lazy(() => import('./components/schedule/ScheduleStage').then((m) => ({ default: m.ScheduleStage })))
const GroupStageView = lazy(() => import('./components/groups/GroupStageView').then((m) => ({ default: m.GroupStageView })))
const BracketView = lazy(() => import('./components/knockout/BracketView').then((m) => ({ default: m.BracketView })))
const ProbabilityDashboard = lazy(() =>
  import('./components/probability/ProbabilityDashboard').then((m) => ({ default: m.ProbabilityDashboard })),
)
const SandboxPanel = lazy(() => import('./components/sandbox/SandboxPanel').then((m) => ({ default: m.SandboxPanel })))
const FifaRankingTab = lazy(() => import('./components/ranking/FifaRankingTab').then((m) => ({ default: m.FifaRankingTab })))
const ContinentalStage = lazy(() => import('./components/continental/ContinentalStage').then((m) => ({ default: m.ContinentalStage })))
const SeasonHome = lazy(() => import('./components/season/SeasonHome').then((m) => ({ default: m.SeasonHome })))
const MyTeamTab = lazy(() => import('./components/team/MyTeamTab').then((m) => ({ default: m.MyTeamTab })))
const TeamDetailPage = lazy(() => import('./components/team/TeamDetailPage').then((m) => ({ default: m.TeamDetailPage })))
import { useDrawStore } from './store/useDrawStore'
import { useContinentalStore } from './store/useContinentalStore'
import type { CupId } from './data/continental/formats'
import { useQualificationStore } from './store/useQualificationStore'
import { useProgressStore } from './store/useProgressStore'
import { useSandboxStore } from './store/useSandboxStore'
import { useSelectionStore } from './store/useSelectionStore'
import { useSimulationStore } from './store/useSimulationStore'
import { useMomentumStore } from './store/useMomentumStore'
import { useA11yStore } from './store/useA11yStore'
import { resetTournament, advanceToNextEdition } from './store/tournamentActions'

type TabId = 'season' | 'qualifiers' | 'continental' | 'myteam' | 'ranking' | 'draw' | 'schedule' | 'groups' | 'knockout' | 'probability'
type EventContext = 'wc' | 'cup'

const TAB_LABEL: Record<TabId, string> = {
  season: '캘린더',
  qualifiers: '지역예선',
  continental: '대륙컵',
  myteam: '내 팀',
  ranking: 'FIFA 랭킹',
  draw: '조추첨',
  schedule: '일정 진행',
  groups: '조별리그',
  knockout: '토너먼트',
  probability: '확률 대시보드',
}

// 일정 축 IA: 항상 보이는 전역 탭 + '현재 진행 중인 이벤트'의 하위 화면(월드컵 화면들 또는 대륙컵).
// 월드컵도 캘린더 위의 한 이벤트일 뿐이라, 그 상세 탭들은 월드컵을 진행 중일 때만 노출된다.
const HOME_TAB: TabId = 'season'
const GLOBAL_TABS: TabId[] = ['myteam', 'ranking']
const WC_EVENT_TABS: TabId[] = ['qualifiers', 'draw', 'schedule', 'groups', 'knockout', 'probability']
const CUP_EVENT_TABS: TabId[] = ['continental']

/** 진행 상태와 무관하게 언제나 접근 가능한 탭. */
const ALWAYS_ENABLED: TabId[] = ['season', 'qualifiers', 'continental', 'myteam', 'ranking']

/** 현재 이벤트 컨텍스트에 따라 보여줄 탭 순서: 시즌 → (현재 이벤트 화면들) → 내 팀 · FIFA 랭킹. */
function visibleTabIds(context: EventContext): TabId[] {
  return [HOME_TAB, ...(context === 'wc' ? WC_EVENT_TABS : CUP_EVENT_TABS), ...GLOBAL_TABS]
}

function App() {
  // 앱의 축은 '일정(시즌)'이다. 항상 시즌 홈으로 진입해 캘린더에서 대회를 시간 순서로 진행한다.
  // (월드컵도 캘린더 위의 한 이벤트일 뿐이다. 진행 중인 대회는 시즌 홈의 '지금 진행할 일정'에서 이어간다.)
  const [tab, setTab] = useState<TabId>('season')
  // 현재 진행 중인 이벤트 컨텍스트(월드컵 화면들 vs 대륙컵). 캘린더에서 이벤트를 진입하면 전환된다.
  const [context, setContext] = useState<EventContext>('wc')
  const enterWC = () => { setContext('wc'); setTab('qualifiers') }
  const enterCup = (id: CupId, year: number) => {
    useContinentalStore.getState().selectCup(id, year)
    setContext('cup')
    setTab('continental')
  }
  const visibleTabs = visibleTabIds(context)
  // 새로고침/재방문으로 저장된 대회를 이어가는 경우에만 안내 배너를 띄운다.
  const [showResume, setShowResume] = useState(() => useDrawStore.getState().isComplete)
  const isDrawComplete = useDrawStore((s) => s.isComplete)
  // 조추첨 진입 조건: 예선에서 본선 48개국 필드가 준비됐거나 이미 조추첨이 끝났을 때만.
  const hasDrawField = useDrawStore((s) => s.fieldTeams !== null || s.isComplete)
  // 확률 대시보드는 예선 진행 중에도(본선 진출 확률) 접근 가능하게 한다.
  const hasQualResult = useQualificationStore((s) => s.result !== null)
  const sandboxMode = useSandboxStore((s) => s.sandboxMode)
  const reduceMotion = useA11yStore((s) => s.reduceMotion)
  const selectedTeamId = useSelectionStore((s) => s.selectedTeamId)
  const clearTeam = useSelectionStore((s) => s.clearTeam)
  const initSchedule = useProgressStore((s) => s.initSchedule)

  useEffect(() => {
    if (isDrawComplete) initSchedule()
  }, [isDrawComplete, initSchedule])

  // 탭 접근 규칙: 예선·랭킹은 항상, 조추첨은 예선 필드가 준비돼야, 나머지는 조추첨 완료 후.
  const tabDisabled = (id: TabId): boolean => {
    if (ALWAYS_ENABLED.includes(id)) return false
    if (id === 'draw') return !hasDrawField
    if (id === 'probability') return !hasQualResult && !isDrawComplete
    return !isDrawComplete
  }

  // 키보드 단축키: 숫자 1~5로 탭 전환 (v2 #37). 입력 요소에 포커스가 있으면 무시한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      const idx = Number(e.key) - 1
      if (idx >= 0 && idx < visibleTabs.length) {
        const id = visibleTabs[idx]
        if (!tabDisabled(id)) {
          clearTeam()
          setTab(id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawComplete, hasDrawField, hasQualResult, clearTeam, context])

  const isComputing = useSimulationStore((s) => s.isComputing)

  // 경기가 진행되거나(그룹/토너먼트 결과 갱신) 샌드박스 능력치가 바뀔 때마다
  // 확률 대시보드를 새로고침 없이 자동으로 재계산한다(연타 시 과도한 재계산을 막기 위해 디바운스).
  useEffect(() => {
    // 진행 결과가 반영된 모멘텀(C4)을 확률 계산 전에 먼저 갱신한다.
    useMomentumStore.getState().recompute()
    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleRun = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => useSimulationStore.getState().run(), 400)
    }
    const unsubProgress = useProgressStore.subscribe((state, prev) => {
      if (state.groupMatches !== prev.groupMatches || state.knockoutSlots !== prev.knockoutSlots) {
        useMomentumStore.getState().recompute()
        scheduleRun()
      }
    })
    const unsubSandbox = useSandboxStore.subscribe((state, prev) => {
      if (state.overrides !== prev.overrides) scheduleRun()
    })
    return () => {
      unsubProgress()
      unsubSandbox()
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
    <AppShell>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-emerald-500 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        본문 바로가기
      </a>
      <div aria-live="polite" className="sr-only">
        {isComputing ? '확률을 계산하고 있습니다.' : ''}
      </div>
      <Header />
      {sandboxMode && (
        <Suspense fallback={null}>
          <SandboxPanel />
        </Suspense>
      )}
      {showResume && (
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-center text-sm text-emerald-100">
          <span>💾 저장된 대회를 이어가는 중입니다.</span>
          <button
            onClick={() => {
              resetTournament()
              enterWC()
              setShowResume(false)
            }}
            className="rounded-lg bg-emerald-500/25 px-3 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-500/40"
          >
            🆕 새 대회 시작
          </button>
          <button
            onClick={() => setShowResume(false)}
            aria-label="배너 닫기"
            className="rounded-lg px-2 py-1 text-xs text-emerald-200/70 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
      <div className="sticky top-2 z-10 mb-6">
        <TabNav
          tabs={visibleTabs.map((id) => ({ id, label: TAB_LABEL[id], disabled: tabDisabled(id) }))}
          active={tab}
          onChange={(id) => {
            clearTeam()
            setTab(id as TabId)
          }}
        />
      </div>

      <div id="main-content" />
      <Suspense fallback={<div className="py-16 text-center text-sm text-gray-500">불러오는 중…</div>}>
        {selectedTeamId ? (
          <TeamDetailPage />
        ) : (
          <>
            {tab === 'season' && <SeasonHome onNavigateWC={enterWC} onSelectCup={enterCup} />}
            {tab === 'qualifiers' && <QualificationStage onStartFinals={() => setTab('draw')} />}
            {tab === 'continental' && <ContinentalStage onNavigateWC={enterWC} />}
            {tab === 'myteam' && <MyTeamTab />}
            {tab === 'ranking' && <FifaRankingTab />}
            {tab === 'draw' && <DrawStage onComplete={() => setTab('schedule')} />}
            {tab === 'schedule' && (
              <ScheduleStage
                onNextEdition={() => {
                  advanceToNextEdition()
                  setTab('qualifiers')
                }}
              />
            )}
            {tab === 'groups' && <GroupStageView />}
            {tab === 'knockout' && <BracketView />}
            {tab === 'probability' && <ProbabilityDashboard />}
          </>
        )}
      </Suspense>
      <MatchDetailModal />
      <DebugPanel />
      <OnboardingOverlay />
    </AppShell>
    </MotionConfig>
  )
}

export default App
