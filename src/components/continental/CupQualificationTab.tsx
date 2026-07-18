import { useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { SubTabNav } from '../layout/SubTabNav'
import { useContinentalStore } from '../../store/useContinentalStore'
import { useMatchDetailStore, type MatchDetailRef } from '../../store/useMatchDetailStore'
import { CUP_FORMATS } from '../../data/continental/formats'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import type { GroupStanding } from '../../types/group'
import type { CupMatch } from '../../engine/continental/runCup'

const GROUP_LETTER = (i: number) => String.fromCharCode(65 + i)
const QUAL_STYLE_KO: Record<string, string> = {
  combinedWcq: '월드컵 지역예선과 통합 — 같은 캠페인 성적순으로 본선 진출국을 가립니다(별도 예선 없음).',
  nationsLeague: '네이션스리그 방식 — 상위는 성적순 직행, 나머지는 예비 플레이오프로 남은 자리를 다툽니다.',
  groups: '예선 조별리그 — 각 조 상위권 + 최고 순위 잔여 팀이 본선에 진출합니다.',
}

function StandingsTable({ standings, ranking, qualified, hostSet }: { standings: Record<string, GroupStanding>; ranking: string[]; qualified: Set<string>; hostSet: Set<string> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-gray-500">
            <th className="px-1 py-0.5 text-left font-medium">#</th>
            <th className="px-1 py-0.5 text-left font-medium">팀</th>
            <th className="px-1 py-0.5 text-center font-medium">경기</th>
            <th className="px-1 py-0.5 text-center font-medium">승무패</th>
            <th className="px-1 py-0.5 text-center font-medium">득실</th>
            <th className="px-1 py-0.5 text-center font-medium">승점</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((tid, i) => {
            const s = standings[tid]
            if (!s) return null
            return (
              <tr key={tid} className={`border-t border-white/5 ${qualified.has(tid) ? 'bg-emerald-500/10' : ''}`}>
                <td className="px-1 py-0.5 tabular-nums text-gray-400">{i + 1}</td>
                <td className="px-1 py-0.5"><span className="flex items-center gap-1"><TeamLink teamId={tid} wrap className="min-w-0" />{hostSet.has(tid) && <span className="shrink-0 text-[9px] text-sky-300">🏟</span>}{qualified.has(tid) && <span className="shrink-0 text-[9px] font-bold text-emerald-300">진출</span>}</span></td>
                <td className="px-1 py-0.5 text-center tabular-nums text-gray-400">{s.played}</td>
                <td className="px-1 py-0.5 text-center tabular-nums text-gray-400">{s.win}·{s.draw}·{s.loss}</td>
                <td className="px-1 py-0.5 text-center tabular-nums text-gray-400">{s.goalsFor}-{s.goalsAgainst}</td>
                <td className="px-1 py-0.5 text-center font-bold tabular-nums text-white">{s.points}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 대륙컵 지역예선 탭. 캘린더로 다가온 대륙컵의 예선(조편성·일정·조별 순위)을 월드컵 예선과 같은 수준으로
 * 보여준다. 통합예선(아시안컵 등)·네이션스리그(골드컵)는 별도 예선 경기가 없으므로 산출 방식과 진출국을 안내한다.
 */
export function CupQualificationTab() {
  const activeCupId = useContinentalStore((s) => s.activeCupId)
  const cupYear = useContinentalStore((s) => s.cupYear)
  const qualResult = useContinentalStore((s) => s.qualResult)
  const hostIds = useContinentalStore((s) => s.hostIds)
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)
  const [sub, setSub] = useState<'draw' | 'schedule' | 'standings'>('standings')

  if (!activeCupId || !qualResult) {
    return (
      <GlassCard className="p-8 text-center text-sm text-gray-400">
        🌍 진행 중인 대륙컵 예선이 없습니다. <strong className="text-gray-300">캘린더</strong>에서 대륙컵이 다가오면
        (▶ 다음 일정 진행) 그 예선의 조편성·일정·조별 순위를 여기에서 볼 수 있어요.
      </GlassCard>
    )
  }

  const format = CUP_FORMATS[activeCupId]
  const hostSet = new Set(hostIds)
  const qualifiedSet = new Set(qualResult.qualified)
  const groupBased = qualResult.groups.length > 0

  const matchRef = (m: CupMatch): MatchDetailRef => ({
    kind: 'group',
    external: true,
    match: { group: 'A', matchday: 1, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals },
  })

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">🌍 {format.nameKo} {cupYear} · 지역예선</p>
        {hostIds.length > 0 && (
          <p className="mb-1 text-[11px] text-sky-300">🏟️ 개최국: {hostIds.map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join(' · ')}</p>
        )}
        <p className="text-[11px] text-gray-400">{QUAL_STYLE_KO[format.qual.style] ?? '예선을 거쳐 본선 참가국을 가립니다.'}</p>
      </GlassCard>

      {groupBased ? (
        <>
          <SubTabNav
            ariaLabel="대륙컵 지역예선 상세"
            active={sub}
            onChange={(id) => setSub(id as typeof sub)}
            tabs={[
              { id: 'draw', label: '조편성' },
              { id: 'schedule', label: '일정·진행' },
              { id: 'standings', label: '조별 순위' },
            ]}
          />
          {sub === 'draw' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {qualResult.groups.map((g, gi) => (
                <GlassCard key={gi} className="p-3">
                  <p className="mb-2 text-xs font-bold text-emerald-200">예선 {GROUP_LETTER(gi)}조</p>
                  <div className="space-y-1">
                    {g.teams.map((tid) => (
                      <div key={tid} className="flex items-center gap-1 text-[11px]"><TeamLink teamId={tid} wrap className="min-w-0" />{hostSet.has(tid) && <span className="text-[9px] text-sky-300">🏟</span>}</div>
                    ))}
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
          {sub === 'schedule' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {qualResult.groups.map((g, gi) => (
                <GlassCard key={gi} className="p-3">
                  <p className="mb-2 text-xs font-bold text-emerald-200">예선 {GROUP_LETTER(gi)}조 경기</p>
                  <div className="space-y-1">
                    {g.matches.map((m, i) => (
                      <button key={i} onClick={() => selectMatch(matchRef(m))} className="flex w-full items-center gap-1.5 rounded-md bg-white/5 px-1.5 py-1 text-[11px] transition-colors hover:bg-white/15">
                        <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-right"><TeamLink teamId={m.homeTeamId} reverse wrap className="min-w-0" /></span>
                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-bold tabular-nums text-white">{m.homeGoals}-{m.awayGoals}</span>
                        <span className="flex min-w-0 flex-1 items-center gap-1"><TeamLink teamId={m.awayTeamId} wrap className="min-w-0" /></span>
                      </button>
                    ))}
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
          {sub === 'standings' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {qualResult.groups.map((g, gi) => (
                <GlassCard key={gi} className="p-3">
                  <p className="mb-2 text-xs font-bold text-emerald-200">예선 {GROUP_LETTER(gi)}조</p>
                  <StandingsTable standings={g.standings} ranking={g.ranking} qualified={qualifiedSet} hostSet={hostSet} />
                </GlassCard>
              ))}
            </div>
          )}
        </>
      ) : (
        <GlassCard className="p-4">
          <p className="mb-2 text-xs font-bold text-emerald-200">본선 진출 {qualResult.qualified.length}개국</p>
          <div className="flex flex-wrap gap-1.5">
            {qualResult.qualified.map((tid) => (
              <span key={tid} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] ${hostSet.has(tid) ? 'bg-sky-500/15' : qualResult.autoQualified.includes(tid) ? 'bg-violet-500/15' : 'bg-emerald-500/15'}`}>
                <TeamLink teamId={tid} wrap className="min-w-0" />
                {hostSet.has(tid) ? <span className="text-[9px] text-sky-300">🏟 개최</span> : qualResult.autoQualified.includes(tid) ? <span className="text-[9px] text-violet-300">직행</span> : <span className="text-[9px] text-emerald-300">통과</span>}
              </span>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  )
}
