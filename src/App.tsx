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
const MyTeamTab = lazy(() => import('./components/team/MyTeamTab').then((m) => ({ default: m.MyTeamTab })))
const TeamDetailPage = lazy(() => import('./components/team/TeamDetailPage').then((m) => ({ default: m.TeamDetailPage })))
import { useDrawStore } from './store/useDrawStore'
import { useQualificationStore } from './store/useQualificationStore'
import { useProgressStore } from './store/useProgressStore'
import { useSandboxStore } from './store/useSandboxStore'
import { useSelectionStore } from './store/useSelectionStore'
import { useSimulationStore } from './store/useSimulationStore'
import { useMomentumStore } from './store/useMomentumStore'
import { useA11yStore } from './store/useA11yStore'
import { resetTournament, advanceToNextEdition } from './store/tournamentActions'

type TabId = 'qualifiers' | 'continental' | 'myteam' | 'ranking' | 'draw' | 'schedule' | 'groups' | 'knockout' | 'probability'

const TABS: { id: TabId; label: string }[] = [
  { id: 'qualifiers', label: '지역예선' },
  { id: 'continental', label: '대륙컵' },
  { id: 'myteam', label: '내 팀' },
  { id: 'ranking', label: 'FIFA 랭킹' },
  { id: 'draw', label: '조추첨' },
  { id: 'schedule', label: '일정 진행' },
  { id: 'groups', label: '조별리그' },
  { id: 'knockout', label: '토너먼트' },
  { id: 'probability', label: '확률 대시보드' },
]

/** 진행 상태와 무관하게 언제나 접근 가능한 탭. 대륙컵은 월드컵 흐름과 독립(격리 스토어). */
const ALWAYS_ENABLED: TabId[] = ['qualifiers', 'continental', 'myteam', 'ranking']

function App() {
  // 시작은 지역예선부터. 저장된 대회를 이어가는 경우에만 조추첨/일정으로 진입한다.
  const [tab, setTab] = useState<TabId>(() => {
    const draw = useDrawStore.getState()
    if (draw.isComplete) return 'schedule'
    if (draw.fieldTeams) return 'draw' // 예선을 거쳐 조추첨 준비된 상태
    return 'qualifiers'
  })
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
      if (idx >= 0 && idx < TABS.length) {
        const t = TABS[idx]
        if (!tabDisabled(t.id)) {
          clearTeam()
          setTab(t.id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawComplete, hasDrawField, hasQualResult, clearTeam])

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
              setTab('qualifiers')
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
          tabs={TABS.map((t) => ({ ...t, disabled: tabDisabled(t.id) }))}
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
            {tab === 'qualifiers' && <QualificationStage onStartFinals={() => setTab('draw')} />}
            {tab === 'continental' && <ContinentalStage />}
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
