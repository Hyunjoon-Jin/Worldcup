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
const WorldCupTab = lazy(() => import('./components/worldcup/WorldCupTab').then((m) => ({ default: m.WorldCupTab })))
const FriendliesTab = lazy(() => import('./components/friendlies/FriendliesTab').then((m) => ({ default: m.FriendliesTab })))
const CupQualificationTab = lazy(() => import('./components/continental/CupQualificationTab').then((m) => ({ default: m.CupQualificationTab })))
const SandboxPanel = lazy(() => import('./components/sandbox/SandboxPanel').then((m) => ({ default: m.SandboxPanel })))
const FifaRankingTab = lazy(() => import('./components/ranking/FifaRankingTab').then((m) => ({ default: m.FifaRankingTab })))
const ContinentalTab = lazy(() => import('./components/continental/ContinentalTab').then((m) => ({ default: m.ContinentalTab })))
const SeasonHome = lazy(() => import('./components/season/SeasonHome').then((m) => ({ default: m.SeasonHome })))
const MyTeamTab = lazy(() => import('./components/team/MyTeamTab').then((m) => ({ default: m.MyTeamTab })))
const TeamDetailPage = lazy(() => import('./components/team/TeamDetailPage').then((m) => ({ default: m.TeamDetailPage })))
import { useDrawStore } from './store/useDrawStore'
import { useContinentalStore } from './store/useContinentalStore'
import type { CupId } from './data/continental/formats'
import { useProgressStore } from './store/useProgressStore'
import { useSandboxStore } from './store/useSandboxStore'
import { useSelectionStore } from './store/useSelectionStore'
import { useSimulationStore } from './store/useSimulationStore'
import { useMomentumStore } from './store/useMomentumStore'
import { useA11yStore } from './store/useA11yStore'
import { resetTournament, advanceToNextEdition } from './store/tournamentActions'

// 대회 중심 IA: 각 대회(친선전·대륙컵 예선·월드컵 예선·대륙컵·월드컵)를 최상위 탭으로 두고,
// 상세 화면(조추첨·일정·조별리그·토너먼트·확률)은 각 대회의 '하위 탭'에서 본다. 예전엔 월드컵 상세가
// 최상위에 흩어져 월드컵 중심의 잘못된 구조였다.
type TabId = 'season' | 'friendlies' | 'cupqual' | 'qualifiers' | 'continental' | 'worldcup' | 'myteam' | 'ranking'

const TAB_LABEL: Record<TabId, string> = {
  season: '캘린더',
  friendlies: '친선전',
  cupqual: '대륙컵 지역예선',
  qualifiers: '월드컵 지역예선',
  continental: '대륙컵',
  worldcup: '월드컵',
  myteam: '내 팀',
  ranking: 'FIFA 랭킹',
}

/** 최상위 탭 순서(항상 전부 노출). 상세는 각 대회 하위 탭에서 접근·게이팅한다. */
const TOP_TABS: TabId[] = ['season', 'friendlies', 'cupqual', 'qualifiers', 'continental', 'worldcup', 'myteam', 'ranking']

function App() {
  // 앱의 축은 '일정(시즌)'이다. 항상 시즌 홈으로 진입해 캘린더에서 대회를 시간 순서로 진행한다.
  // (월드컵도 캘린더 위의 한 이벤트일 뿐이다. 진행 중인 대회는 시즌 홈의 '지금 진행할 일정'에서 이어간다.)
  const [tab, setTab] = useState<TabId>('season')
  // 캘린더의 '실황 보기'에서 월드컵으로 진입: 조추첨 이후면 본선(월드컵), 아니면 월드컵 지역예선으로.
  const enterWC = () => setTab(useDrawStore.getState().isComplete ? 'worldcup' : 'qualifiers')
  const enterCup = (id: CupId, year: number) => {
    useContinentalStore.getState().selectCup(id, year)
    setTab('continental')
  }
  const visibleTabs = TOP_TABS
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

  // 최상위 탭은 항상 접근 가능하다(상세 화면의 진행 게이팅은 각 대회의 하위 탭에서 처리).
  const tabDisabled = (_id: TabId): boolean => false

  // 키보드 단축키: 숫자 1~8로 최상위 탭 전환 (v2 #37). 입력 요소에 포커스가 있으면 무시한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      const idx = Number(e.key) - 1
      if (idx >= 0 && idx < visibleTabs.length) {
        clearTeam()
        setTab(visibleTabs[idx])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearTeam, visibleTabs])

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
            {tab === 'friendlies' && <FriendliesTab />}
            {tab === 'cupqual' && <CupQualificationTab />}
            {tab === 'qualifiers' && <QualificationStage onStartFinals={() => setTab('worldcup')} />}
            {tab === 'continental' && <ContinentalTab onNavigateWC={enterWC} />}
            {tab === 'worldcup' && (
              <WorldCupTab
                onNextEdition={() => {
                  advanceToNextEdition()
                  setTab('qualifiers')
                }}
              />
            )}
            {tab === 'myteam' && <MyTeamTab />}
            {tab === 'ranking' && <FifaRankingTab />}
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
