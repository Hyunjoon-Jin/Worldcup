import { GlassCard } from '../common/GlassCard'
import { FlagIcon } from '../common/FlagIcon'
import { useSelectionStore } from '../../store/useSelectionStore'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { useSeasonNews } from './useSeasonNews'

/** 카테고리별 헤드라인 강조색(왼쪽 보더). */
const ACCENT: Record<string, string> = {
  champion: 'border-amber-400/60',
  myTeam: 'border-sky-400/70',
  qualOut: 'border-red-400/50',
  qualIn: 'border-emerald-400/50',
  upset: 'border-sky-400/50',
  rankUp: 'border-emerald-400/40',
  rankDown: 'border-red-400/40',
  streakWin: 'border-orange-400/50',
  streakLoss: 'border-slate-400/40',
  crisis: 'border-yellow-400/50',
}

/**
 * 시즌 소식(뉴스) 카드 (D). 진행 이벤트(우승·이변·예선 드라마·순위 급변·연승연패·위기)를 자동으로
 * 헤드라인화해 시즌 홈 상단에 보여준다. 각 헤드라인의 대표 팀을 클릭하면 팀 상세로 이동한다.
 * 아직 소식거리가 없으면(시작 전) 렌더하지 않는다.
 */
export function SeasonNewsCard() {
  const news = useSeasonNews(6)
  const selectTeam = useSelectionStore((s) => s.selectTeam)

  if (news.length === 0) return null

  return (
    <GlassCard className="p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-200">📰 시즌 소식 <span className="text-[10px] font-normal text-gray-500">자동 생성 헤드라인</span></h3>
      <div className="space-y-1.5">
        {news.map((n) => {
          const lead = n.teamIds[0]
          const nation = lead ? ALL_NATIONS_BY_ID[lead] : undefined
          return (
            <button
              key={n.id}
              onClick={() => lead && selectTeam(lead)}
              className={`flex w-full items-center gap-2 rounded-lg border-l-2 bg-white/5 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/12 ${ACCENT[n.category] ?? 'border-white/20'}`}
            >
              <span className="shrink-0 text-sm">{n.icon}</span>
              {nation && <FlagIcon iso2={nation.iso2} className="h-2.5 w-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate text-gray-100">{n.headline}</span>
            </button>
          )
        })}
      </div>
    </GlassCard>
  )
}
