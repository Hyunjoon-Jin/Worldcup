import { useEffect, useState } from 'react'
import { SubTabNav } from '../layout/SubTabNav'
import { ContinentalStage, type ContinentalView } from './ContinentalStage'
import { useContinentalStore } from '../../store/useContinentalStore'

/**
 * '대륙컵'(본선) 최상위 탭. 월드컵과 동일하게 조추첨/진행·일정/조별리그/토너먼트/확률을 하위 탭으로 묶는다.
 * 진행 중인 대륙컵이 없으면 하위 탭 없이 안내만 표시한다.
 */
export function ContinentalTab({ onNavigateWC, openDrawSignal }: { onNavigateWC?: () => void; openDrawSignal?: number }) {
  const activeCupId = useContinentalStore((s) => s.activeCupId)
  const hasResult = useContinentalStore((s) => s.result != null)
  const [sub, setSub] = useState<ContinentalView>('progress')
  // 캘린더 '조추첨 진행하기'로 진입하면 조추첨 하위탭으로 전환한다.
  useEffect(() => { if (openDrawSignal) setSub('draw') }, [openDrawSignal])

  if (!activeCupId) return <ContinentalStage onNavigateWC={onNavigateWC} view="progress" />

  return (
    <div>
      <SubTabNav
        ariaLabel="대륙컵 본선 상세"
        active={sub}
        onChange={(id) => setSub(id as ContinentalView)}
        tabs={[
          { id: 'draw', label: '조추첨', disabled: !hasResult },
          { id: 'progress', label: '진행·일정' },
          { id: 'groups', label: '조별리그', disabled: !hasResult },
          { id: 'knockout', label: '토너먼트', disabled: !hasResult },
          { id: 'probability', label: '확률', disabled: !hasResult },
        ]}
      />
      <ContinentalStage onNavigateWC={onNavigateWC} view={hasResult ? sub : 'progress'} />
    </div>
  )
}
