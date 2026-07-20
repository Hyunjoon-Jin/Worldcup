import { useMyTeamStore } from '../../store/useMyTeamStore'
import { useSelectionStore } from '../../store/useSelectionStore'
import { useLiveRankLookup } from '../ranking/useLiveFifaRanking'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { FlagIcon } from '../common/FlagIcon'

/**
 * 헤더에 상시 표시되는 '내 팀' 칩. 팀을 고르면 국기·이름·라이브 FIFA 순위를 보여주고, 클릭 시 팀 상세로
 * 이동한다. 아직 안 골랐으면 '내 팀 선택'으로 내 팀 탭을 연다. 앱 어디서나 내 팀을 놓치지 않게 한다.
 */
export function MyTeamChip({ onPick }: { onPick: () => void }) {
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const selectTeam = useSelectionStore((s) => s.selectTeam)
  const liveRank = useLiveRankLookup()
  const team = myTeamId ? ALL_NATIONS_BY_ID[myTeamId] : null

  if (!team) {
    return (
      <button
        onClick={onPick}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-400/20"
      >
        ⭐ 내 팀 선택
      </button>
    )
  }
  return (
    <button
      onClick={() => selectTeam(team.id)}
      title="내 팀 상세 페이지 열기"
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-400/20"
    >
      <span aria-hidden>⭐</span>
      <FlagIcon iso2={team.iso2} className="h-3 w-4 shrink-0" />
      <span className="max-w-[7rem] truncate">{team.nameKo}</span>
      <span className="text-[10px] text-amber-300/70">FIFA {liveRank(team.id, team.fifaRankApprox)}위</span>
    </button>
  )
}
