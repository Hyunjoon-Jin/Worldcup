import { useState } from 'react'
import { SubTabNav } from '../layout/SubTabNav'
import { QualificationStage, type QualView } from './QualificationStage'
import { useQualificationStore } from '../../store/useQualificationStore'

/**
 * '월드컵 지역예선' 최상위 탭. 월드컵 본선처럼 진행·일정 / 조별 순위 / 확률을 하위 탭으로 묶는다.
 * 예선이 아직 시작되지 않았으면 하위 탭 없이 안내만 보여준다.
 */
export function QualificationTab({ onStartFinals }: { onStartFinals?: () => void }) {
  const hasResult = useQualificationStore((s) => s.result != null)
  const [sub, setSub] = useState<QualView>('progress')

  return (
    <div>
      {hasResult && (
        <SubTabNav
          ariaLabel="월드컵 지역예선 상세"
          active={sub}
          onChange={(id) => setSub(id as QualView)}
          tabs={[
            { id: 'progress', label: '진행·일정' },
            { id: 'standings', label: '조별 순위' },
            { id: 'probability', label: '확률' },
          ]}
        />
      )}
      <QualificationStage onStartFinals={onStartFinals} view={hasResult ? sub : 'progress'} />
    </div>
  )
}
