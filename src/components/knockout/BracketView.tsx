import {
  FINAL_SLOT_ID,
  QF_SLOT_IDS,
  R16_SLOT_IDS,
  R32_SLOT_IDS,
  SF_SLOT_IDS,
  THIRD_SLOT_ID,
} from '../../data/bracketTemplate'
import { GlassCard } from '../common/GlassCard'
import { MatchNode } from './MatchNode'
import { useProgressStore } from '../../store/useProgressStore'

const COLUMNS: { title: string; slotIds: string[] }[] = [
  { title: '32강', slotIds: R32_SLOT_IDS },
  { title: '16강', slotIds: R16_SLOT_IDS },
  { title: '8강', slotIds: QF_SLOT_IDS },
  { title: '4강', slotIds: SF_SLOT_IDS },
  { title: '결승 · 3·4위전', slotIds: [FINAL_SLOT_ID, THIRD_SLOT_ID] },
]

export function BracketView() {
  const { knockoutSlots, phase } = useProgressStore()

  if (phase === 'group') {
    return (
      <GlassCard className="p-6 text-center text-sm text-gray-400">
        그룹스테이지가 끝나면 32강 대진이 확정됩니다. "일정 진행" 탭에서 계속 진행하세요.
      </GlassCard>
    )
  }

  return (
    <div>
      <p className="mb-2 text-center text-[11px] text-gray-500 sm:hidden">← 옆으로 스크롤하여 전체 대진표를 확인하세요 →</p>
      <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <div key={col.title} className="flex shrink-0 flex-col gap-3">
            <h3 className="text-center text-xs font-bold text-emerald-300/90">{col.title}</h3>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {col.slotIds.map((id) => (
                <MatchNode key={id} slot={knockoutSlots[id]} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
