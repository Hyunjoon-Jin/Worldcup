import { lazy, Suspense, useEffect, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { AppShell } from './components/layout/AppShell'
import { Header } from './components/layout/Header'
import { TabNav } from './components/layout/TabNav'
import { MatchDetailModal } from './components/common/MatchDetailModal'
import { DebugPanel } from './components/common/DebugPanel'
import { OnboardingOverlay } from './components/common/OnboardingOverlay'

// 탭별 화면은 지연 로딩해 초기 번들 크기를 줄인다 (B5).
const DrawStage = lazy(() => import('./components/draw/DrawStage').then((m) => ({ default: m.DrawStage })))
const ScheduleStage = lazy(() => import('./components/schedule/ScheduleStage').then((m) => ({ default: m.ScheduleStage })))
const GroupStageView = lazy(() => import('./components/groups/GroupStageView').then((m) => ({ default: m.GroupStageView })))
const BracketView = lazy(() => import('./components/knockout/BracketView').then((m) => ({ default: m.BracketView })))
const ProbabilityDashboard = lazy(() =>
  import('./components/probability/ProbabilityDashboard').then((m) => ({ default: m.ProbabilityDashboard })),
)
const SandboxPanel = lazy(() => import('./components/sandbox/SandboxPanel').then((m) => ({ default: m.SandboxPanel })))
const TeamDetailPage = lazy(() => import('./components/team/TeamDetailPage').then((m) => ({ default: m.TeamDetailPage })))
import { useDrawStore } from './store/useDrawStore'
import { useProgressStore } from './store/useProgressStore'
import { useSandboxStore } from './store/useSandboxStore'
import { useSelectionStore } from './store/useSelectionStore'
import { useSimulationStore } from './store/useSimulationStore'
import { useMomentumStore } from './store/useMomentumStore'
import { useA11yStore } from './store/useA11yStore'
import { resetTournament } from './store/tournamentActions'

type TabId = 'draw' | 'schedule' | 'groups' | 'knockout' | 'probability'

const TABS: { id: TabId; label: string }[] = [
  { id: 'draw', label: '조추첨' },
  { id: 'schedule', label: '일정 진행' },
  { id: 'groups', label: '조별리그' },
  { id: 'knockout', label: '토너먼트' },
  { id: 'probability', label: '확률 대시보드' },
]

function App() {
  // 저장된 대회가 완료된 조추첨을 갖고 있으면(이어하기) 일정 탭에서 시작한다 (A3).
  const [tab, setTab] = useState<TabId>(() => (useDrawStore.getState().isComplete ? 'schedule' : 'draw'))
  // 새로고침/재방문으로 저장된 대회를 이어가는 경우에만 안내 배너를 띄운다.
  const [showResume, setShowResume] = useState(() => useDrawStore.getState().isComplete)
  const isDrawComplete = useDrawStore((s) => s.isComplete)
  const sandboxMode = useSandboxStore((s) => s.sandboxMode)
  const reduceMotion = useA11yStore((s) => s.reduceMotion)
  const selectedTeamId = useSelectionStore((s) => s.selectedTeamId)
  const clearTeam = useSelectionStore((s) => s.clearTeam)
  const initSchedule = useProgressStore((s) => s.initSchedule)

  useEffect(() => {
    if (isDrawComplete) initSchedule()
  }, [isDrawComplete, initSchedule])

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
              setTab('draw')
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
          tabs={TABS.map((t) => ({ ...t, disabled: t.id !== 'draw' && !isDrawComplete }))}
          active={tab}
          onChange={(id) => {
            clearTeam()
            setTab(id as TabId)
          }}
        />
      </div>

      <Suspense fallback={<div className="py-16 text-center text-sm text-gray-500">불러오는 중…</div>}>
        {selectedTeamId ? (
          <TeamDetailPage />
        ) : (
          <>
            {tab === 'draw' && <DrawStage onComplete={() => setTab('schedule')} />}
            {tab === 'schedule' && <ScheduleStage />}
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
