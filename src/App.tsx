import { useEffect, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { Header } from './components/layout/Header'
import { TabNav } from './components/layout/TabNav'
import { DrawStage } from './components/draw/DrawStage'
import { ScheduleStage } from './components/schedule/ScheduleStage'
import { GroupStageView } from './components/groups/GroupStageView'
import { BracketView } from './components/knockout/BracketView'
import { ProbabilityDashboard } from './components/probability/ProbabilityDashboard'
import { SandboxPanel } from './components/sandbox/SandboxPanel'
import { TeamDetailPage } from './components/team/TeamDetailPage'
import { MatchDetailModal } from './components/common/MatchDetailModal'
import { useDrawStore } from './store/useDrawStore'
import { useProgressStore } from './store/useProgressStore'
import { useSandboxStore } from './store/useSandboxStore'
import { useSelectionStore } from './store/useSelectionStore'
import { useSimulationStore } from './store/useSimulationStore'
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
  const selectedTeamId = useSelectionStore((s) => s.selectedTeamId)
  const clearTeam = useSelectionStore((s) => s.clearTeam)
  const initSchedule = useProgressStore((s) => s.initSchedule)

  useEffect(() => {
    if (isDrawComplete) initSchedule()
  }, [isDrawComplete, initSchedule])

  // 경기가 진행되거나(그룹/토너먼트 결과 갱신) 샌드박스 능력치가 바뀔 때마다
  // 확률 대시보드를 새로고침 없이 자동으로 재계산한다(연타 시 과도한 재계산을 막기 위해 디바운스).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleRun = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => useSimulationStore.getState().run(), 400)
    }
    const unsubProgress = useProgressStore.subscribe((state, prev) => {
      if (state.groupMatches !== prev.groupMatches || state.knockoutSlots !== prev.knockoutSlots) scheduleRun()
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
    <AppShell>
      <Header />
      {sandboxMode && <SandboxPanel />}
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
      <MatchDetailModal />
    </AppShell>
  )
}

export default App
