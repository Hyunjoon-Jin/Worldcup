import { useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { Header } from './components/layout/Header'
import { TabNav } from './components/layout/TabNav'
import { DrawStage } from './components/draw/DrawStage'
import { ScheduleStage } from './components/schedule/ScheduleStage'
import { GroupStageView } from './components/groups/GroupStageView'
import { BracketView } from './components/knockout/BracketView'
import { ProbabilityDashboard } from './components/probability/ProbabilityDashboard'
import { SandboxPanel } from './components/sandbox/SandboxPanel'
import { useDrawStore } from './store/useDrawStore'
import { useSandboxStore } from './store/useSandboxStore'

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

  return (
    <AppShell>
      <Header />
      {sandboxMode && <SandboxPanel />}
      <div className="sticky top-2 z-10 mb-6">
        <TabNav
          tabs={TABS.map((t) => ({ ...t, disabled: t.id !== 'draw' && !isDrawComplete }))}
          active={tab}
          onChange={(id) => setTab(id as TabId)}
        />
      </div>

      {tab === 'draw' && <DrawStage onComplete={() => setTab('schedule')} />}
      {tab === 'schedule' && <ScheduleStage />}
      {tab === 'groups' && <GroupStageView />}
      {tab === 'knockout' && <BracketView />}
      {tab === 'probability' && <ProbabilityDashboard />}
    </AppShell>
  )
}

export default App
