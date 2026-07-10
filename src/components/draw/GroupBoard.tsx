import { GROUP_LETTERS } from '../../data/hostSlots'
import { GroupSlotCard } from './GroupSlotCard'
import type { GroupSlots } from '../../engine/drawEngine'

interface GroupBoardProps {
  groups: GroupSlots
  highlightGroup?: string | null
}

export function GroupBoard({ groups, highlightGroup }: GroupBoardProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {GROUP_LETTERS.map((letter) => (
        <GroupSlotCard key={letter} letter={letter} teams={groups[letter]} highlight={highlightGroup === letter} />
      ))}
    </div>
  )
}
