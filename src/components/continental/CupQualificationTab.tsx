import { useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { TeamLink } from '../common/TeamLink'
import { SubTabNav } from '../layout/SubTabNav'
import { useContinentalStore } from '../../store/useContinentalStore'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useMatchDetailStore, type MatchDetailRef } from '../../store/useMatchDetailStore'
import { CUP_FORMATS, ALL_CUP_IDS, type CupId } from '../../data/continental/formats'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import type { GroupStanding } from '../../types/group'
import type { CupMatch } from '../../engine/continental/runCup'

const GROUP_LETTER = (i: number) => String.fromCharCode(65 + i)
const CONFED_KO: Record<string, string> = { AFC: 'AFC(아시아)', CAF: 'CAF(아프리카)', UEFA: 'UEFA(유럽)', CONMEBOL: 'CONMEBOL(남미)', CONCACAF: 'CONCACAF(북중미)', OFC: 'OFC(오세아니아)' }
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
 * 통합 예선(combinedWcq: 아시안컵) 뷰 — 월드컵 지역예선과 '같은 캠페인'임을 그대로 보여준다.
 * 별도 예선 경기가 아니라, 해당 대륙(AFC 등)의 월드컵 예선 최종 순위를 그대로 나열하고 상위 N개국을
 * 대륙컵 본선 진출로 표시한다. 월드컵 예선 진행이 곧 대륙컵 예선 진행이 되도록(동시 반영) 한다.
 */
function CombinedCampaignView({ confed, slots, qualifiedSet, hostSet, cutLabel }: { confed: string; slots: number; qualifiedSet: Set<string>; hostSet: Set<string>; cutLabel: string }) {
  const qr = useQualificationStore((s) => s.result)
  const confResult = qr?.byConfederation[confed]
  if (!confResult) {
    return (
      <GlassCard className="p-6 text-center text-[12px] text-gray-400">
        아직 월드컵 지역예선이 진행되지 않았습니다. <strong className="text-gray-300">캘린더</strong>에서 예선을 진행하면
        같은 캠페인 성적이 여기에 반영됩니다.
      </GlassCard>
    )
  }
  const wcQualified = new Set(confResult.qualified)
  const playoff = new Set(confResult.playoff)
  return (
    <div className="flex flex-col gap-3">
      <GlassCard className="border border-emerald-400/20 bg-emerald-500/[0.06] p-3 text-[11px] leading-relaxed text-emerald-100/90">
        🔗 <strong className="text-emerald-200">월드컵 지역예선과 통합된 예선</strong>입니다. 아래는 {CONFED_KO[confed] ?? confed}
        {' '}월드컵 예선(같은 캠페인) 최종 순위이며, <strong className="text-emerald-200">상위 {slots}개국</strong>이 {cutLabel} 본선에 진출합니다.
      </GlassCard>
      <GlassCard className="p-3">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-500">
                <th className="px-1 py-0.5 text-left font-medium">#</th>
                <th className="px-1 py-0.5 text-left font-medium">팀</th>
                <th className="px-1 py-0.5 text-left font-medium">비고</th>
              </tr>
            </thead>
            <tbody>
              {confResult.standings.map((tid, i) => {
                const isIn = qualifiedSet.has(tid) || i < slots
                return (
                  <tr key={tid} className={`border-t border-white/5 ${i === slots ? 'border-t-2 border-emerald-400/40' : ''} ${isIn ? 'bg-emerald-500/[0.08]' : 'opacity-60'}`}>
                    <td className="px-1 py-0.5 tabular-nums text-gray-400">{i + 1}</td>
                    <td className="px-1 py-0.5">
                      <span className="flex items-center gap-1">
                        <TeamLink teamId={tid} wrap className="min-w-0" />
                        {hostSet.has(tid) && <span className="shrink-0 text-[9px] text-sky-300">🏟</span>}
                      </span>
                    </td>
                    <td className="px-1 py-0.5 text-[9px]">
                      {wcQualified.has(tid) ? <span className="font-bold text-amber-300">🏆 월드컵 직행</span>
                        : playoff.has(tid) ? <span className="text-violet-300">대륙간 PO</span>
                        : isIn ? <span className="font-bold text-emerald-300">✅ {cutLabel} 진출</span>
                        : <span className="text-gray-600">탈락</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}

/**
 * 통합 예선(combinedWcq: 아시안컵 등) 실황 섹션. 월드컵 지역예선과 '동시 진행'되므로, 월드컵 예선이
 * 시작되면 대회가 아직 활성이 아니어도 항상 실황(같은 캠페인 순위 + 진행률)을 보여준다.
 */
function CombinedCupQualSection({ cupId }: { cupId: CupId }) {
  const wcQual = useQualificationStore((s) => s.result)
  const wcRevealed = useQualificationStore((s) => s.revealed)
  const activeCupId = useContinentalStore((s) => s.activeCupId)
  const cupQualResult = useContinentalStore((s) => s.qualResult)
  const cupHostIds = useContinentalStore((s) => s.hostIds)
  const cupYear = useContinentalStore((s) => s.cupYear)
  const format = CUP_FORMATS[cupId]
  const confed = format.confeds[0]
  const confResult = wcQual?.byConfederation[confed]
  if (!confResult) return null
  // 이 대회가 현재 활성이면 개최국·확정 진출국 정보를 함께 반영한다.
  const isActive = activeCupId === cupId && cupQualResult != null
  const hostSet = isActive ? new Set(cupHostIds) : new Set<string>()
  const qualifiedSet = isActive ? new Set(cupQualResult.qualified) : new Set<string>()
  const revealed = wcRevealed[confed] ?? 0
  const total = confResult.matchdays || 1
  const done = revealed >= total
  const pct = Math.min(100, Math.round((revealed / total) * 100))
  return (
    <div className="flex flex-col gap-3">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">🌍 {format.nameKo}{isActive && cupYear ? ` ${cupYear}` : ''} · 지역예선</p>
        {isActive && cupHostIds.length > 0 && (
          <p className="mb-1 text-[11px] text-sky-300">🏟️ 개최국: {cupHostIds.map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join(' · ')}</p>
        )}
        <div className="mx-auto mt-2 h-2 max-w-md overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-gray-500">{done ? '✅ 예선 완료' : `진행 중 · ${CONFED_KO[confed] ?? confed} 월드컵 예선 경기일 ${revealed}/${total}`}</p>
      </GlassCard>
      <CombinedCampaignView confed={confed} slots={format.teams} qualifiedSet={qualifiedSet} hostSet={hostSet} cutLabel={format.nameKo} />
    </div>
  )
}

/** 자체 예선(조별리그·네이션스리그 등)을 치르는 활성 대륙컵의 예선 실황. */
function ActiveCupQualView({ activeCupId }: { activeCupId: CupId }) {
  const cupYear = useContinentalStore((s) => s.cupYear)
  const qualResult = useContinentalStore((s) => s.qualResult)
  const hostIds = useContinentalStore((s) => s.hostIds)
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)
  const [sub, setSub] = useState<'draw' | 'schedule' | 'standings'>('standings')
  if (!qualResult) return null
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {qualResult.groups.map((g, gi) => (
              <GlassCard key={gi} className="p-3">
                <p className="mb-2 text-xs font-bold text-emerald-200">예선 {GROUP_LETTER(gi)}조</p>
                {sub === 'draw' && (
                  <div className="space-y-1">
                    {g.teams.map((tid) => (
                      <div key={tid} className="flex items-center gap-1 text-[11px]"><TeamLink teamId={tid} wrap className="min-w-0" />{hostSet.has(tid) && <span className="text-[9px] text-sky-300">🏟</span>}</div>
                    ))}
                  </div>
                )}
                {sub === 'standings' && <StandingsTable standings={g.standings} ranking={g.ranking} qualified={qualifiedSet} hostSet={hostSet} />}
                {sub === 'schedule' && (
                  <div className="space-y-1">
                    {g.matches.map((m, i) => (
                      <button key={i} onClick={() => selectMatch(matchRef(m))} className="flex w-full items-center gap-1.5 rounded-md bg-white/5 px-1.5 py-1 text-[11px] transition-colors hover:bg-white/15">
                        <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-right"><TeamLink teamId={m.homeTeamId} reverse wrap className="min-w-0" /></span>
                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-bold tabular-nums text-white">{m.homeGoals}-{m.awayGoals}</span>
                        <span className="flex min-w-0 flex-1 items-center gap-1"><TeamLink teamId={m.awayTeamId} wrap className="min-w-0" /></span>
                      </button>
                    ))}
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
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

/**
 * 대륙컵 지역예선 탭. 통합 예선(아시안컵 등, combinedWcq)은 월드컵 지역예선과 '동시 진행'되므로 월드컵
 * 예선이 시작되면 항상 실황을 보여준다(대회 활성 여부와 무관). 자체 예선을 치르는 대회(유로·아프리카컵·
 * 골드컵 등)는 캘린더에서 그 대회가 다가와 활성일 때 그 예선을 함께 표시한다.
 */
export function CupQualificationTab() {
  const activeCupId = useContinentalStore((s) => s.activeCupId)
  const qualResult = useContinentalStore((s) => s.qualResult)
  const wcQual = useQualificationStore((s) => s.result)

  // 통합 예선 대회(월드컵 예선과 동시 진행) — 월드컵 예선이 있으면 항상 실황 표시.
  const combinedCups = wcQual ? ALL_CUP_IDS.filter((id) => CUP_FORMATS[id].qual.style === 'combinedWcq') : []
  // 활성 대회가 통합 예선이면 위 실황에서 이미 다루므로 중복 표시하지 않는다.
  const activeIsCombined = activeCupId != null && CUP_FORMATS[activeCupId].qual.style === 'combinedWcq'
  const showActive = activeCupId != null && qualResult != null && !activeIsCombined

  if (combinedCups.length === 0 && !showActive) {
    return (
      <GlassCard className="p-8 text-center text-sm text-gray-400">
        🌍 진행 중인 대륙컵 예선이 없습니다. <strong className="text-gray-300">캘린더</strong>에서 대륙컵이 다가오면
        (▶ 다음 일정 진행) 그 예선의 조편성·조별 순위·경기 일정을 여기에서 볼 수 있어요.
        <br />
        <span className="text-[11px] text-gray-500">아시안컵처럼 월드컵 지역예선과 통합된 예선은 월드컵 예선을 시작하면 여기에 함께 표시됩니다.</span>
      </GlassCard>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {combinedCups.map((id) => (
        <CombinedCupQualSection key={id} cupId={id} />
      ))}
      {showActive && activeCupId && <ActiveCupQualView activeCupId={activeCupId} />}
    </div>
  )
}
