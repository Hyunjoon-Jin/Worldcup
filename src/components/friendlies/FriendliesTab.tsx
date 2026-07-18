import { useMemo } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { FlagIcon } from '../common/FlagIcon'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useCareerStore } from '../../store/useCareerStore'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { useMatchDetailStore, type MatchDetailRef } from '../../store/useMatchDetailStore'
import { qualWindowDate } from '../../engine/qualification/calendar'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import type { FriendlyMatch } from '../../engine/qualification/friendlies'

function koDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}.${Number(m)}.${Number(d)}`
}

/** 친선전 한 경기를 경기 상세 모달로 여는 ref(월드컵 조/브래킷 맥락 없이 external 표시). */
function friendlyRef(f: FriendlyMatch): MatchDetailRef {
  return {
    kind: 'group',
    external: true,
    match: { group: 'A', matchday: 1, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeGoals: f.homeGoals, awayGoals: f.awayGoals },
  }
}

/**
 * 친선전(평가전) 탭. 지역예선 기간 중, 그 경기일에 예선 경기가 없는 국가들끼리 편성되는 평가전을
 * 날짜(경기일)별로 보여준다. 내 팀 평가전을 위에 강조하고, 전체 평가전을 최신 경기일부터 나열한다.
 * 아직 공개되지 않은(진행 전) 경기일의 평가전은 표시하지 않는다.
 */
export function FriendliesTab() {
  const result = useQualificationStore((s) => s.result)
  const friendlies = useQualificationStore((s) => s.friendlies)
  const revealed = useQualificationStore((s) => s.revealed)
  const wcYear = useCareerStore((s) => s.year)
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)

  // 전역 공개 경기일(대륙 최대 라운드 기준). 이 경기일까지의 평가전만 '치른 경기'로 표시.
  const globalRevealed = useMemo(() => (result ? Math.max(0, ...Object.values(revealed)) : 0), [result, revealed])

  const played = useMemo(() => friendlies.filter((f) => f.matchday <= globalRevealed), [friendlies, globalRevealed])

  // 경기일(window)별 그룹 — 최신 경기일부터.
  const byWindow = useMemo(() => {
    const map = new Map<number, FriendlyMatch[]>()
    for (const f of played) {
      const arr = map.get(f.matchday) ?? []
      arr.push(f)
      map.set(f.matchday, arr)
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [played])

  const myGames = useMemo(
    () => (myTeamId ? played.filter((f) => f.homeTeamId === myTeamId || f.awayTeamId === myTeamId).sort((a, b) => a.matchday - b.matchday) : []),
    [played, myTeamId],
  )

  if (!result) {
    return (
      <GlassCard className="p-8 text-center text-sm text-gray-400">
        🤝 아직 지역예선이 시작되지 않았습니다. <strong className="text-gray-300">캘린더</strong>에서{' '}
        <strong className="text-emerald-300">▶ 다음 일정 진행</strong>으로 예선을 진행하면, 그 기간 중 열리는
        평가전(친선전)을 여기에서 볼 수 있어요.
      </GlassCard>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">🤝 친선전(평가전)</p>
        <p className="text-[11px] text-gray-400">
          지역예선 기간 중 그 경기일에 예선 경기가 없는 국가들끼리 편성되는 평가전입니다(전력 차 50위 이내끼리만 성사).
          중립 경기라 홈 이점은 적용되지 않습니다.
        </p>
      </GlassCard>

      {/* 내 팀 평가전 */}
      {myTeamId && (
        <GlassCard className="p-4">
          <h3 className="mb-2 flex items-center gap-1 text-sm font-bold text-sky-300">⭐ 내 팀 <TeamLink teamId={myTeamId} /> 평가전</h3>
          {myGames.length === 0 ? (
            <p className="text-[11px] text-gray-500">아직 내 팀 평가전이 없습니다(예선 경기가 있는 경기일엔 평가전을 잡지 않습니다).</p>
          ) : (
            <div className="space-y-1">
              {myGames.map((f) => {
                const isHome = f.homeTeamId === myTeamId
                const oppId = isHome ? f.awayTeamId : f.homeTeamId
                const gf = isHome ? f.homeGoals : f.awayGoals
                const ga = isHome ? f.awayGoals : f.homeGoals
                const res = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
                return (
                  <button key={`my-${f.matchday}-${oppId}`} onClick={() => selectMatch(friendlyRef(f))} className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-white/15">
                    <span className="w-16 shrink-0 tabular-nums text-[10px] text-gray-400">{koDate(qualWindowDate(f.matchday - 1, wcYear))}</span>
                    <span className="shrink-0 text-[10px] text-gray-500">평가전</span>
                    <span className="flex min-w-0 flex-1 items-center gap-1"><span className="text-gray-500">vs</span><TeamLink teamId={oppId} wrap className="min-w-0" /></span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 font-bold tabular-nums ${res === 'W' ? 'bg-emerald-500/20 text-emerald-300' : res === 'L' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-gray-300'}`}>{gf}-{ga}</span>
                  </button>
                )
              })}
            </div>
          )}
        </GlassCard>
      )}

      {/* 전체 평가전 — 경기일별(최신순) */}
      <GlassCard className="p-4">
        <h3 className="mb-2 text-sm font-bold text-gray-200">전체 평가전 · {played.length}경기</h3>
        {byWindow.length === 0 ? (
          <p className="text-[11px] text-gray-500">아직 진행된 평가전이 없습니다. 캘린더에서 예선을 진행하면 표시됩니다.</p>
        ) : (
          <div className="space-y-3">
            {byWindow.map(([md, games]) => (
              <div key={md}>
                <p className="mb-1 text-[11px] font-bold text-sky-300/80">🗓 {koDate(qualWindowDate(md - 1, wcYear))} · 경기일 {md} <span className="text-gray-500">({games.length}경기)</span></p>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {games.map((f, i) => {
                    const home = ALL_NATIONS_BY_ID[f.homeTeamId]
                    const away = ALL_NATIONS_BY_ID[f.awayTeamId]
                    return (
                      <button key={`${md}-${i}`} onClick={() => selectMatch(friendlyRef(f))} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1 text-xs transition-colors hover:bg-white/15">
                        <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-right"><span className="truncate">{home?.nameKo ?? f.homeTeamId}</span>{home && <FlagIcon iso2={home.iso2} className="h-2.5 w-3.5 shrink-0" />}</span>
                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-bold tabular-nums text-white">{f.homeGoals}-{f.awayGoals}</span>
                        <span className="flex min-w-0 flex-1 items-center gap-1">{away && <FlagIcon iso2={away.iso2} className="h-2.5 w-3.5 shrink-0" />}<span className="truncate">{away?.nameKo ?? f.awayTeamId}</span></span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
