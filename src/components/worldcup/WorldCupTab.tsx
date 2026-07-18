import { useEffect, useState } from 'react'
import { SubTabNav } from '../layout/SubTabNav'
import { DrawStage } from '../draw/DrawStage'
import { ScheduleStage } from '../schedule/ScheduleStage'
import { GroupStageView } from '../groups/GroupStageView'
import { BracketView } from '../knockout/BracketView'
import { ProbabilityDashboard } from '../probability/ProbabilityDashboard'
import { GlassCard } from '../common/GlassCard'
import { useDrawStore } from '../../store/useDrawStore'
import { useQualificationStore } from '../../store/useQualificationStore'

type WcSub = 'draw' | 'schedule' | 'groups' | 'knockout' | 'probability'

/**
 * '월드컵'(본선) 최상위 탭. 조추첨→일정 진행→조별리그→토너먼트→확률 대시보드를 하위 탭으로 묶는다.
 * 예전엔 이 상세 화면들이 최상위 탭에 흩어져 월드컵 중심의 잘못된 IA였는데, 여기로 모아 계층을 바로잡는다.
 */
export function WorldCupTab({ onNextEdition, openDrawSignal }: { onNextEdition: () => void; openDrawSignal?: number }) {
  const hasDrawField = useDrawStore((s) => s.fieldTeams !== null || s.isComplete)
  const isDrawComplete = useDrawStore((s) => s.isComplete)
  const hasQualResult = useQualificationStore((s) => s.result !== null)
  const [sub, setSub] = useState<WcSub>('draw')
  // 캘린더 '조추첨 진행하기'로 진입하면 조추첨 하위탭으로 전환한다.
  useEffect(() => { if (openDrawSignal) setSub('draw') }, [openDrawSignal])

  const disabled: Record<WcSub, boolean> = {
    draw: !hasDrawField,
    schedule: !isDrawComplete,
    groups: !isDrawComplete,
    knockout: !isDrawComplete,
    probability: !hasQualResult && !isDrawComplete,
  }
  const active = disabled[sub] ? (['draw', 'schedule', 'groups', 'knockout', 'probability'] as WcSub[]).find((s) => !disabled[s]) ?? 'draw' : sub

  return (
    <div>
      <SubTabNav
        ariaLabel="월드컵 본선 상세"
        active={active}
        onChange={(id) => setSub(id as WcSub)}
        tabs={[
          { id: 'draw', label: '조추첨', disabled: disabled.draw },
          { id: 'schedule', label: '일정 진행', disabled: disabled.schedule },
          { id: 'groups', label: '조별리그', disabled: disabled.groups },
          { id: 'knockout', label: '토너먼트', disabled: disabled.knockout },
          { id: 'probability', label: '확률 대시보드', disabled: disabled.probability },
        ]}
      />
      {active === 'draw' && !hasDrawField ? (
        <GlassCard className="p-8 text-center text-sm text-gray-400">
          아직 본선 진출국이 확정되지 않았습니다. <strong className="text-emerald-300">월드컵 지역예선</strong>을 마치면
          조추첨부터 진행할 수 있어요.
        </GlassCard>
      ) : active === 'draw' ? (
        <DrawStage onComplete={() => setSub('schedule')} />
      ) : active === 'schedule' ? (
        <ScheduleStage onNextEdition={onNextEdition} />
      ) : active === 'groups' ? (
        <GroupStageView />
      ) : active === 'knockout' ? (
        <BracketView />
      ) : (
        <ProbabilityDashboard />
      )}
    </div>
  )
}
