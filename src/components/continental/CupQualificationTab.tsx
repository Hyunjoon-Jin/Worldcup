import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { SubTabNav } from '../layout/SubTabNav'
import { useContinentalStore } from '../../store/useContinentalStore'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useCareerStore } from '../../store/useCareerStore'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { useMatchDetailStore, type MatchDetailRef } from '../../store/useMatchDetailStore'
import { cupRankByTeam } from '../../store/seasonActions'
import { CUP_FORMATS, ALL_CUP_IDS, type CupId, type CupFormat } from '../../data/continental/formats'
import { ALL_NATIONS_BY_ID, baseRatingsMap, nationsByConfederation } from '../../data/nations'
import { runCupQualification, type CupQualResult } from '../../engine/continental/cupQualification'
import { computeCupQualProbabilities } from '../../engine/continental/cupQualProbability'
import { selectCupHosts } from '../../engine/continental/hostSelection'
import { buildSeasonTimeline } from '../../engine/season/seasonTimeline'
import { DEFAULT_HOST_IDS } from '../../engine/qualification/index'
import { computeStandings } from '../../engine/tiebreakers'
import type { GroupStanding } from '../../types/group'
import type { QualificationResult } from '../../types/qualification'
import type { CupMatch } from '../../engine/continental/runCup'

/** 대륙컵 지역예선 상세 하위 탭(월드컵 지역예선과 동형): 진행·일정 / 조별 순위 / 확률. */
type QualView = 'progress' | 'standings' | 'probability'

const GROUP_LETTER = (i: number) => String.fromCharCode(65 + i)
const CONFED_KO: Record<string, string> = { AFC: 'AFC(아시아)', CAF: 'CAF(아프리카)', UEFA: 'UEFA(유럽)', CONMEBOL: 'CONMEBOL(남미)', CONCACAF: 'CONCACAF(북중미)', OFC: 'OFC(오세아니아)' }
/** 하위 탭용 짧은 대회명(긴 정식명 대신 탭 폭에 맞춘 축약). */
const CUP_SHORT: Record<CupId, string> = { EURO: '유로', COPA: '코파', AFCON: '아프리카컵', ASIAN: '아시안컵', GOLD: '골드컵', OFC: 'OFC' }
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

/** 확률 막대 셀(월드컵 확률 대시보드와 동형). */
function ProbBarCell({ value }: { value: number }) {
  return (
    <td className="px-1 py-1">
      <div className="relative h-5 w-full min-w-[64px] overflow-hidden rounded bg-white/5">
        <div className="absolute inset-y-0 left-0 rounded bg-emerald-400/25" style={{ width: `${Math.min(100, value)}%` }} />
        <span className="absolute inset-0 flex items-center justify-center tabular-nums text-gray-200">{value >= 10 ? value.toFixed(0) : value.toFixed(1)}%</span>
      </div>
    </td>
  )
}

/** 대륙컵 지역예선 진출 확률(버튼 눌러 몬테카를로 계산) — 월드컵 지역예선 확률 탭과 동형. */
function CupQualProbView({ format, hostIds }: { format: CupFormat; hostIds: string[] }) {
  const [probs, setProbs] = useState<Record<string, number> | null>(null)
  const [busy, setBusy] = useState(false)
  const compute = () => {
    setBusy(true)
    // 무거운 계산이라 다음 틱으로 넘겨 '계산 중' 표시가 먼저 그려지게 한다.
    setTimeout(() => {
      const pool = [...new Set(format.confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))]
      const iters = format.qual.style === 'combinedWcq' ? 150 : 240
      setProbs(computeCupQualProbabilities(format, baseRatingsMap(pool), hostIds, iters, `${format.id}-QPROB`, { rankByTeam: cupRankByTeam(format.id) ?? {} }))
      setBusy(false)
    }, 20)
  }
  if (!probs) {
    return (
      <GlassCard className="p-8 text-center">
        <p className="text-sm text-gray-300">📊 본선 진출 확률</p>
        <p className="mt-1 text-[11px] text-gray-500">예선을 여러 번 시뮬레이션해 각 팀이 본선에 진출하는 빈도를 확률로 구합니다.</p>
        <GlassButton className="mt-3" onClick={compute} disabled={busy}>{busy ? '계산 중…' : '📊 진출 확률 계산'}</GlassButton>
      </GlassCard>
    )
  }
  const rows = Object.entries(probs).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 40)
  return (
    <GlassCard className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-200">📊 본선 진출 확률 <span className="text-[11px] font-normal text-gray-500">(상위 {rows.length})</span></h3>
        <GlassButton variant="ghost" onClick={compute} disabled={busy}>{busy ? '계산 중…' : '↻ 재계산'}</GlassButton>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead><tr className="text-gray-500"><th className="px-1 py-1 text-left font-medium">#</th><th className="px-1 py-1 text-left font-medium">팀</th><th className="px-1 py-1 text-center font-medium">본선 진출</th></tr></thead>
          <tbody>
            {rows.map(([id, v], i) => (
              <tr key={id} className="border-t border-white/5">
                <td className="px-1 py-1 tabular-nums text-gray-400">{i + 1}</td>
                <td className="px-1 py-1"><TeamLink teamId={id} wrap className="min-w-0" /></td>
                <ProbBarCell value={v} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}

const provRank = (teams: string[], standings: Record<string, GroupStanding>) =>
  [...teams].sort((a, b) => {
    const sa = standings[a], sb = standings[b]
    return sb.points - sa.points || (sb.goalsFor - sb.goalsAgainst) - (sa.goalsFor - sa.goalsAgainst) || sb.goalsFor - sa.goalsFor || a.localeCompare(b)
  })

/** 한 대륙(연맹) 월드컵 예선의 조별 순위 — 공개된 경기일까지만 반영한 잠정 순위(스포일러 방지). */
function ConfedGroupStandings({ confResult, revealed }: { confResult: QualificationResult; revealed: number }) {
  const groups = confResult.groups
    .map((teams, gi) => {
      const played = confResult.matches.filter((m) => m.group === gi && m.matchday <= revealed)
      if (played.length === 0) return null
      const standings = computeStandings(teams, played)
      return { gi, label: confResult.groupLabels?.[gi] ?? `${gi + 1}조`, standings, ranking: provRank(teams, standings) }
    })
    .filter((g): g is { gi: number; label: string; standings: Record<string, GroupStanding>; ranking: string[] } => g != null)
  if (groups.length === 0) {
    return <GlassCard className="p-6 text-center text-[12px] text-gray-500">아직 공개된 경기가 없습니다. 캘린더에서 <strong className="text-gray-400">월드컵 지역예선</strong>을 진행하면 조별 순위가 채워집니다.</GlassCard>
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {groups.map((g) => (
        <GlassCard key={g.gi} className="p-3">
          <p className="mb-2 text-xs font-bold text-emerald-200">{g.label}</p>
          <StandingsTable standings={g.standings} ranking={g.ranking} qualified={new Set()} hostSet={new Set()} />
        </GlassCard>
      ))}
    </div>
  )
}

/**
 * 통합 예선(combinedWcq: 아시안컵 등) 상세. 월드컵 지역예선과 '동시 진행'되므로, 월드컵 예선 공개 진척에
 * 맞춰(스포일러 없이) 진행·일정 / 조별 순위 / 확률을 보여준다. 예선이 끝나야 최종 진출국이 확정된다.
 */
function CombinedQualView({ cupId, view }: { cupId: CupId; view: QualView }) {
  const wcQual = useQualificationStore((s) => s.result)
  const wcRevealed = useQualificationStore((s) => s.revealed)
  const format = CUP_FORMATS[cupId]
  const confed = format.confeds[0]
  const confResult = wcQual?.byConfederation[confed]
  if (!confResult) {
    return (
      <GlassCard className="p-8 text-center text-sm text-gray-400">
        🔗 <strong className="text-gray-300">{format.nameKo}</strong> 예선은 {CONFED_KO[confed] ?? confed} 월드컵 지역예선과 통합 진행됩니다.
        <br />
        <span className="text-[11px] text-gray-500">캘린더에서 월드컵 지역예선을 시작하면 같은 캠페인 실황이 여기에 표시됩니다.</span>
      </GlassCard>
    )
  }
  const revealed = wcRevealed[confed] ?? 0
  const total = confResult.matchdays || 1
  const done = revealed >= total
  const pct = Math.min(100, Math.round((revealed / total) * 100))
  return (
    <div className="flex flex-col gap-4">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">🌍 {format.nameKo} · 지역예선</p>
        <div className="mx-auto mt-2 h-2 max-w-md overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[10px] text-gray-500">{done ? '✅ 예선 완료' : `진행 중 · ${CONFED_KO[confed] ?? confed} 월드컵 예선 경기일 ${revealed}/${total}`}</p>
      </GlassCard>

      {view === 'probability' ? (
        <CupQualProbView format={format} hostIds={DEFAULT_HOST_IDS} />
      ) : view === 'progress' ? (
        <GlassCard className="border border-emerald-400/20 bg-emerald-500/[0.06] p-4 text-[12px] leading-relaxed text-emerald-100/90">
          🔗 <strong className="text-emerald-200">{format.nameKo} 예선은 월드컵 지역예선과 통합</strong>됩니다. {CONFED_KO[confed] ?? confed} 월드컵 예선을
          그대로 치르고, 그 최종 순위 <strong className="text-emerald-200">상위 {format.teams}개국</strong>이 {format.nameKo} 본선에 진출합니다.
          <div className="mt-2 text-[11px] text-gray-400">
            {done
              ? `예선이 종료되어 진출국이 확정됐습니다. '조별 순위' 탭에서 최종 순위와 진출 컷을 확인하세요.`
              : `현재 ${CONFED_KO[confed] ?? confed} 월드컵 예선 경기일 ${revealed}/${total} 진행 중입니다. '조별 순위' 탭에서 지금까지의 순위를, '확률' 탭에서 진출 확률을 볼 수 있어요. 캘린더에서 월드컵 지역예선을 계속 진행하세요.`}
          </div>
        </GlassCard>
      ) : done ? (
        // 예선 완료: 최종 순위 + 진출 컷.
        <CombinedCampaignView confed={confed} slots={format.teams} qualifiedSet={new Set()} hostSet={new Set()} cutLabel={format.nameKo} />
      ) : (
        // 진행 중: 공개된 경기까지의 잠정 조별 순위(스포일러 방지).
        <ConfedGroupStandings confResult={confResult} revealed={revealed} />
      )}
    </div>
  )
}

/**
 * 자체 예선(조별리그·네이션스리그 등) 결과 본문 — 실제(활성) 또는 예상(온디맨드) 데이터 공용 렌더.
 * 상위 하위탭(view)에 따라 진행·일정(경기 목록) / 조별 순위 / 확률을 보여준다.
 */
function CupQualBody({ format, year, qualResult, hostIds, projected, view }: { format: CupFormat; year?: number | null; qualResult: CupQualResult; hostIds: string[]; projected: boolean; view: QualView }) {
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)
  const hostSet = new Set(hostIds)
  const qualifiedSet = new Set(qualResult.qualified)
  const groupBased = qualResult.groups.length > 0
  const matchRef = (m: CupMatch): MatchDetailRef => ({
    kind: 'group',
    external: true,
    match: { group: 'A', matchday: 1, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals },
  })
  return (
    <div className="flex flex-col gap-4">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-1 text-sm font-semibold text-white">🌍 {format.nameKo}{year ? ` ${year}` : ''} · 지역예선</p>
        {hostIds.length > 0 && (
          <p className="mb-1 text-[11px] text-sky-300">🏟️ 개최국: {hostIds.map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join(' · ')}</p>
        )}
        <p className="text-[11px] text-gray-400">{QUAL_STYLE_KO[format.qual.style] ?? '예선을 거쳐 본선 참가국을 가립니다.'}</p>
        {projected && (
          <p className="mt-1 text-[10px] text-amber-300/80">🔮 예상 — 현재 전력·월드컵 예선 성적 기준의 예측입니다. 캘린더에서 이 대회가 시작되면 확정됩니다.</p>
        )}
      </GlassCard>

      {view === 'probability' ? (
        <CupQualProbView format={format} hostIds={hostIds} />
      ) : !groupBased ? (
        // 조별 예선이 없는 방식(통합/네이션스리그/초청): 진출국 목록.
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
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {qualResult.groups.map((g, gi) => (
            <GlassCard key={gi} className="p-3">
              <p className="mb-2 text-xs font-bold text-emerald-200">예선 {GROUP_LETTER(gi)}조</p>
              {view === 'standings' ? (
                <StandingsTable standings={g.standings} ranking={g.ranking} qualified={qualifiedSet} hostSet={hostSet} />
              ) : (
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
      )}
    </div>
  )
}

/**
 * 한 대륙컵의 예선 상세 — 월드컵 지역예선과 동형의 하위 탭(진행·일정 / 조별 순위 / 확률). 통합 예선(아시안컵
 * 등)은 월드컵 예선과 동시 진행 실황을(공개된 만큼만), 자체 예선 대회는 활성이면 실제, 아니면 실제 진행 시와
 * 동일한 시드·개최국·랭킹으로 계산한 '예상'을 보여준다.
 */
function CupQualDetail({ cupId }: { cupId: CupId }) {
  const format = CUP_FORMATS[cupId]
  const wcYear = useCareerStore((s) => s.year)
  const wcReady = useQualificationStore((s) => s.result != null)
  const activeCupId = useContinentalStore((s) => s.activeCupId)
  const activeQual = useContinentalStore((s) => s.qualResult)
  const activeHosts = useContinentalStore((s) => s.hostIds)
  const activeYear = useContinentalStore((s) => s.cupYear)
  const isCombined = format.qual.style === 'combinedWcq'
  const isActive = activeCupId === cupId && activeQual != null
  const [view, setView] = useState<QualView>('standings')

  // 이 대회 연도(현재 사이클) — 온디맨드 계산 시드/개최국을 실제 자동 시뮬과 동일하게 맞춰 결과가 일치.
  const year = useMemo(() => {
    const ev = buildSeasonTimeline(wcYear).find((e) => e.kind === 'cup' && e.id === cupId)
    return ev?.year ?? wcYear
  }, [wcYear, cupId])

  // 활성이 아니고 통합 예선도 아니면, 실제 진행 시와 동일하게 예선을 계산(= 나중에 확정될 결과와 동일).
  const projected = useMemo(() => {
    if (isCombined || isActive) return null
    const seed = `${cupId}-${year}`
    const pool = [...new Set(format.confeds.flatMap((c) => nationsByConfederation(c).map((t) => t.id)))]
    const hosts = selectCupHosts(format, seed)
    return { qualResult: runCupQualification(format, baseRatingsMap(pool), hosts, seed, cupRankByTeam(cupId) ?? {}), hosts }
    // wcReady를 의존성에 포함해 월드컵 예선이 준비되면 캠페인 반영 랭킹으로 재계산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cupId, year, isCombined, isActive, wcReady])

  return (
    <div className="flex flex-col gap-4">
      <SubTabNav
        ariaLabel="대륙컵 지역예선 상세"
        active={view}
        onChange={(id) => setView(id as QualView)}
        tabs={[
          { id: 'progress', label: '진행·일정' },
          { id: 'standings', label: '조별 순위' },
          { id: 'probability', label: '확률' },
        ]}
      />
      {isCombined ? (
        <CombinedQualView cupId={cupId} view={view} />
      ) : isActive && activeQual ? (
        <CupQualBody format={format} year={activeYear} qualResult={activeQual} hostIds={activeHosts} projected={false} view={view} />
      ) : projected ? (
        <CupQualBody format={format} year={year} qualResult={projected.qualResult} hostIds={projected.hosts} projected={true} view={view} />
      ) : null}
    </div>
  )
}

/**
 * 대륙컵 지역예선 탭 — 월드컵 지역예선과 같은 층위. 6개 대륙 대표 대회의 예선을 하위 탭으로 나눠, 사용자가
 * 어느 대륙이든 골라 예선 실황·진출 현황을 볼 수 있다. 기본 탭은 내 팀 소속 대륙의 대회로 맞춘다.
 * 통합 예선(아시안컵 등)은 월드컵 예선과 동시 진행 실황을, 그 외는 실제 진행 시와 동일한 예상 진출을 보여준다.
 */
export function CupQualificationTab() {
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const myConfed = myTeamId ? ALL_NATIONS_BY_ID[myTeamId]?.confederation : undefined
  const defaultCup = useMemo<CupId>(() => {
    if (myConfed) {
      const primary = ALL_CUP_IDS.find((id) => CUP_FORMATS[id].confeds[0] === myConfed)
      if (primary) return primary
      const any = ALL_CUP_IDS.find((id) => CUP_FORMATS[id].confeds.includes(myConfed))
      if (any) return any
    }
    return 'ASIAN'
  }, [myConfed])
  const [sel, setSel] = useState<CupId>(() => defaultCup)

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-4 text-center">
        <p className="text-sm font-semibold text-white">🌍 대륙별 지역예선</p>
        <p className="mt-1 text-[11px] text-gray-400">각 대륙 대표 대회의 예선을 월드컵 지역예선과 같은 수준으로 봅니다. 아래에서 대륙을 골라 실황·진출 현황을 확인하세요.</p>
      </GlassCard>
      <SubTabNav
        ariaLabel="대륙별 지역예선"
        active={sel}
        onChange={(id) => setSel(id as CupId)}
        tabs={ALL_CUP_IDS.map((id) => ({ id, label: CUP_SHORT[id] }))}
      />
      <CupQualDetail cupId={sel} />
    </div>
  )
}
