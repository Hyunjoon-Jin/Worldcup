import { useEffect, useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { useContinentalStore } from '../../store/useContinentalStore'
import { CUP_FORMATS } from '../../data/continental/formats'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { CupBracketView } from './CupBracketView'
import { CupDrawCeremony } from './CupDrawCeremony'
import { CupProbabilityView } from './CupProbabilityView'
import { ContinentalGroupsView } from './ContinentalGroupsView'
import { ContinentalProgressView } from './ContinentalProgressView'

function QualSummaryCard({ qualStyle }: { qualStyle?: string }) {
  const qualResult = useContinentalStore((s) => s.qualResult)
  const [open, setOpen] = useState(false)
  if (!qualResult) return null
  const { autoQualified, earned, groups } = qualResult
  return (
    <GlassCard className="p-4">
      <h3 className="mb-2 text-sm font-bold text-gray-200">🎫 예선 결과 <span className="text-[11px] font-normal text-gray-500">(자동 {autoQualified.length} · 통과 {earned.length})</span></h3>
      {qualStyle === 'combinedWcq' && (
        <p className="mb-2 text-[11px] text-amber-300/90">🔗 예선은 월드컵 지역예선과 통합 진행됩니다 — 월드컵 예선 성적으로 본선 진출국이 결정됩니다.</p>
      )}
      {qualStyle === 'nationsLeague' && (
        <p className="mb-2 text-[11px] text-amber-300/90">🔗 예선은 CONCACAF 네이션스리그로 치릅니다 — 상위 리그는 직행, 나머지는 프렐림 플레이오프로 결정됩니다.</p>
      )}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {autoQualified.map((id) => (
          <span key={id} className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] text-sky-200"><TeamLink teamId={id} /> <span className="text-[9px] text-sky-300/70">자동</span></span>
        ))}
        {earned.map((id) => (
          <span key={id} className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-200"><TeamLink teamId={id} /> <span className="text-[9px] text-emerald-300/70">통과</span></span>
        ))}
      </div>
      {groups.length > 0 && (
        <>
          <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-gray-400 hover:text-gray-200">
            {open ? '▲ 예선 조별 결과 접기' : `▼ 예선 조별 결과 보기 (${groups.length}개 조)`}
          </button>
          {open && (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g, gi) => (
                <div key={gi}>
                  <p className="mb-1 text-[11px] font-bold text-gray-400">예선 {gi + 1}조</p>
                  <div className="space-y-0.5">
                    {g.ranking.map((id, i) => {
                      const s = g.standings[id]
                      return (
                        <div key={id} className="flex items-center gap-2 text-[11px]">
                          <span className="w-4 text-center text-gray-500">{i + 1}</span>
                          <span className="min-w-0 flex-1"><TeamLink teamId={id} /></span>
                          <span className="tabular-nums text-gray-400">{s.points}점</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </GlassCard>
  )
}


/** 대륙컵 본선 하위 화면(월드컵과 동일 수준): 조추첨(조편성)/진행·일정/조별리그/토너먼트/확률. */
export type ContinentalView = 'draw' | 'progress' | 'groups' | 'knockout' | 'probability'

export function ContinentalStage({ onNavigateWC, onGoToProgress, view = 'progress' }: { onNavigateWC?: () => void; onGoToProgress?: () => void; view?: ContinentalView }) {
  const activeCupId = useContinentalStore((s) => s.activeCupId)
  const hostIds = useContinentalStore((s) => s.hostIds)
  const result = useContinentalStore((s) => s.result)
  const probabilities = useContinentalStore((s) => s.probabilities)
  const probLoading = useContinentalStore((s) => s.probLoading)
  const championTrend = useContinentalStore((s) => s.championTrend)
  const stage = useContinentalStore((s) => s.stage)
  const computeProbabilities = useContinentalStore((s) => s.computeProbabilities)

  const format = activeCupId ? CUP_FORMATS[activeCupId] : null

  // 단계별 공개(월드컵 '일정 진행'과 동형): 0=조추첨, 1~3=조별 MD, 4~=녹아웃 라운드.
  const revealedGroupMd = Math.min(stage, 3)
  const revealedKoRounds = Math.max(0, stage - 3)

  // 확률 탭을 열면(또는 단계가 바뀌면) 자동으로 실황 반영 확률을 다시 계산한다(월드컵과 동일한 실시간성).
  useEffect(() => {
    if (view === 'probability' && result) computeProbabilities()
  }, [view, stage, result, computeProbabilities])

  // 최근 공개 경기 성적(골득실) 기반 폼 — 확률 대시보드 상승세/하락세 태그용(월드컵 momentum과 동형).
  const momentumByTeam = useMemo<Record<string, number>>(() => {
    if (!result || !format) return {}
    const m: Record<string, number> = {}
    const gm = result.groups.flatMap((g) => g.matches.filter((x) => x.matchday <= revealedGroupMd)).sort((a, b) => a.matchday - b.matchday)
    for (const x of gm) {
      m[x.homeTeamId] = x.homeGoals - x.awayGoals
      m[x.awayTeamId] = x.awayGoals - x.homeGoals
    }
    const ko = result.knockout
      .filter((x) => { const i = format.knockout.indexOf(x.round); return i >= 0 && i < revealedKoRounds })
      .sort((a, b) => format.knockout.indexOf(a.round) - format.knockout.indexOf(b.round))
    for (const x of ko) {
      m[x.homeTeamId] = x.result.homeGoals - x.result.awayGoals
      m[x.awayTeamId] = x.result.awayGoals - x.result.homeGoals
    }
    return m
  }, [result, format, revealedGroupMd, revealedKoRounds])

  // 조추첨 포트(시드 등급) 복원 — 실제 조추첨(drawCupGroups)과 동일하게 개최국을 포트1로 보호한다.
  // 포트1 = 개최국 + 상위 비개최국으로 groups개, 포트2.. = 잔여 비개최국을 능력치 순으로 groups명씩.
  // (개최국을 능력치대로 포트4에 넣던 예전 계산은 실제 배정과 어긋나 조마다 포트가 중복돼 보였다.)
  const drawInfo = useMemo(() => {
    if (!result || !format) return null
    const field = result.groups.flatMap((g) => g.teams)
    const hostSet = new Set((result.hosts ?? []).filter((id) => field.includes(id)))
    const protectedHosts = [...hostSet].slice(0, format.groups)
    const rating = (id: string) => ALL_NATIONS_BY_ID[id]?.baseRatings.overall ?? 0
    const nonHost = field.filter((id) => !hostSet.has(id)).sort((a, b) => rating(b) - rating(a) || a.localeCompare(b))
    const pots: string[][] = [[...protectedHosts, ...nonHost.slice(0, format.groups - protectedHosts.length)]]
    let cursor = format.groups - protectedHosts.length
    for (let p = 1; p < format.teamsPerGroup; p++) {
      pots.push(nonHost.slice(cursor, cursor + format.groups))
      cursor += format.groups
    }
    const potOf = new Map<string, number>()
    pots.forEach((pot, pi) => pot.forEach((t) => potOf.set(t, pi)))
    const groupOf = new Map<string, number>()
    result.groups.forEach((g) => g.teams.forEach((t) => groupOf.set(t, g.groupIndex)))
    return { pots, potOf, groupOf }
  }, [result, format])

  if (!activeCupId || !format) {
    // 캘린더 축: 대회를 임의로 고를 수 없다. 다가온 대회만 캘린더에서 진입한다.
    return (
      <div className="flex flex-col gap-5">
        <GlassCard strong className="p-5 text-center">
          <p className="mb-1 text-sm font-semibold text-white">🏆 대륙별 대표 대회</p>
          <p className="text-xs text-gray-400">각 대륙의 대표 대회를 월드컵과 동일하게 조추첨·조별리그·녹아웃까지 시뮬레이션합니다.</p>
        </GlassCard>
        <GlassCard className="p-8 text-center">
          <p className="text-sm text-gray-300">진행 중인 대륙컵이 없습니다.</p>
          <p className="mt-1 text-[11px] text-gray-500">대회는 캘린더의 일정 순서대로 다가옵니다. <strong className="text-emerald-300">캘린더</strong> 탭에서 다가온 일정을 진행하세요.</p>
          {onNavigateWC && (
            <GlassButton variant="ghost" className="mt-3" onClick={onNavigateWC}>← 캘린더로</GlassButton>
          )}
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {!result ? (
        <GlassCard className="p-8 text-center text-sm text-gray-400">
          <strong className="text-gray-300">캘린더</strong>에서 이 대회의 <strong className="text-emerald-300">조추첨 진행하기</strong>를 눌러 조추첨부터 우승까지 진행하세요.
        </GlassCard>
      ) : (
        <>
          {/* 일정 진행: 월드컵 ScheduleStage와 동형(상태·타임라인·다음경기·결과피드·통계·우승) + 예선 요약 */}
          {view === 'progress' && (
            <>
              <ContinentalProgressView result={result} format={format} onNavigate={onNavigateWC} />
              <QualSummaryCard qualStyle={format.qual.style} />
            </>
          )}

          {/* 조추첨: 팀을 하나씩 뽑는 연출(월드컵 DrawStage와 동형). 대회가 시작되면(stage>0) 전체 공개로 고정. */}
          {view === 'draw' && drawInfo && format && (
            <CupDrawCeremony result={result} format={format} drawInfo={drawInfo} hostIds={hostIds} onComplete={onGoToProgress} complete={stage > 0} />
          )}

          {/* 조별리그 — 월드컵 조별리그 뷰와 완전히 동일(같은 컴포넌트 재사용) */}
          {view === 'groups' && (
            <ContinentalGroupsView result={result} format={format} revealedMd={revealedGroupMd} />
          )}

          {/* 토너먼트(녹아웃) — 월드컵 BracketView처럼 카드/제목 래퍼 없이 대진표만 렌더 */}
          {view === 'knockout' && (
            <CupBracketView knockout={result.knockout} format={format} revealedRounds={revealedKoRounds} />
          )}

          {/* 확률 — 진출 체인(조별 통과 → 각 라운드 도달 → 우승), 월드컵 확률 대시보드와 동형(전 팀·정렬·내 팀 강조) */}
          {view === 'probability' && (
            probabilities ? (
              <CupProbabilityView
                probabilities={probabilities}
                chainRounds={format.knockout}
                onRefresh={(n) => computeProbabilities(n)}
                momentumByTeam={momentumByTeam}
                trend={championTrend ?? []}
                loading={probLoading}
              />
            ) : (
              <GlassCard className="p-8 text-center text-[11px] text-gray-500">
                📊 진출·우승 확률을 계산하고 있어요…
              </GlassCard>
            )
          )}
        </>
      )}
    </div>
  )
}
