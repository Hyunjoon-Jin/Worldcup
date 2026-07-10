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
import { useDrawStore } from './store/useDrawStore'
import { useProgressStore } from './store/useProgressStore'
import { useSandboxStore } from './store/useSandboxStore'
import { useSelectionStore } from './store/useSelectionStore'
import { useSimulationStore } from './store/useSimulationStore'

type TabId = 'draw' | 'schedule' | 'groups' | 'knockout' | 'probability'

const TABS: { id: TabId; label: string }[] = [
  { id: 'draw', label: '조추첨' },
  { id: 'schedule', label: '일정 진행' },
  { id: 'groups', label: '조별리그' },
  { id: 'knockout', label: '토너먼트' },
  { id: 'probability', label: '확률 대시보드' },
]

function App() {
  const [tab, setTab] = useState<TabId>('draw')
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
    </AppShell>
  )
}

export default App
