import { useEffect, useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { useContinentalStore, cupTotalStages } from '../../store/useContinentalStore'
import { CUP_FORMATS } from '../../data/continental/formats'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { buildCupPhases } from '../../engine/season/seasonTimeline'
import { BASE_FINALS_YEAR, formatKoreanDate } from '../../data/calendar'
import { CupBracketView } from './CupBracketView'
import { CupDrawCeremony } from './CupDrawCeremony'
import { CupProbabilityView } from './CupProbabilityView'
import { ContinentalGroupsView } from './ContinentalGroupsView'
import { ContinentalProgressView } from './ContinentalProgressView'
import type { KnockoutRound } from '../../types/match'

const ROUND_LABEL: Record<KnockoutRound, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위전', FINAL: '결승' }
const MONTH_LABEL = { summer: '여름(6–7월)', january: '1월', winterAfcon: '겨울(12–1월)' } as const

function QualSummaryCard() {
  const qualResult = useContinentalStore((s) => s.qualResult)
  const [open, setOpen] = useState(false)
  if (!qualResult) return null
  const { autoQualified, earned, groups } = qualResult
  return (
    <GlassCard className="p-4">
      <h3 className="mb-2 text-sm font-bold text-gray-200">🎫 예선 결과 <span className="text-[11px] font-normal text-gray-500">(자동 {autoQualified.length} · 통과 {earned.length})</span></h3>
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
  const cupYear = useContinentalStore((s) => s.cupYear)
  const result = useContinentalStore((s) => s.result)
  const probabilities = useContinentalStore((s) => s.probabilities)
  const championTrend = useContinentalStore((s) => s.championTrend)
  const stage = useContinentalStore((s) => s.stage)
  const computeProbabilities = useContinentalStore((s) => s.computeProbabilities)

  const format = activeCupId ? CUP_FORMATS[activeCupId] : null

  // 대회 일정(라운드별 날짜) — 대륙대회 일정 상세화.
  const cupPhases = useMemo(
    () => (activeCupId ? buildCupPhases(activeCupId, cupYear ?? BASE_FINALS_YEAR) : []),
    [activeCupId, cupYear],
  )

  // 단계별 공개(월드컵 '일정 진행'과 동형): 0=조추첨, 1~3=조별 MD, 4~=녹아웃 라운드.
  const totalStages = activeCupId ? cupTotalStages(activeCupId) : 0
  const revealedGroupMd = Math.min(stage, 3)
  const revealedKoRounds = Math.max(0, stage - 3)
  const fullyRevealed = result != null && stage >= totalStages

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
      <GlassCard strong className="p-5 text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <p className="text-sm font-bold text-white">🏆 {format.nameKo}{cupYear ? ` ${cupYear}` : ''}</p>
        </div>
        <p className="mb-3 text-[11px] text-gray-400">
          {format.teams}팀 · {format.groups}개 조 · {format.knockout.map((r) => ROUND_LABEL[r]).join('→')}
          {format.thirdPlace ? ' (+3·4위전)' : ''} · {MONTH_LABEL[format.schedule.monthWindow]}
        </p>
        {format.qual.style === 'combinedWcq' && (
          <p className="mb-3 text-[11px] text-amber-300/90">🔗 예선은 월드컵 지역예선과 통합 진행됩니다 — 월드컵 예선 성적으로 본선 진출국이 결정됩니다.</p>
        )}
        {format.qual.style === 'nationsLeague' && (
          <p className="mb-3 text-[11px] text-amber-300/90">🔗 예선은 CONCACAF 네이션스리그로 치릅니다 — 상위 리그는 직행, 나머지는 프렐림 플레이오프로 결정됩니다.</p>
        )}
        {/* 개최국은 에디션별로 경제·지역을 고려해 자동 선정된다(공동개최 가능). */}
        <p className="mb-3 text-[11px] text-sky-300">
          🏟️ 개최{hostIds.length > 1 ? '(공동)' : ''}: {hostIds.length > 0 ? hostIds.map((id) => ALL_NATIONS_BY_ID[id]?.nameKo ?? id).join(' · ') : '미정'}
        </p>
        <p className="text-[11px] text-gray-500">캘린더의 <strong className="text-emerald-300">조추첨 진행하기</strong>로 진입해 조추첨부터 우승까지 단계별로 진행합니다.</p>
      </GlassCard>

      {/* 대회 일정(라운드별 날짜) — 대륙대회 일정 상세화 (진행·일정 뷰) */}
      {view === 'progress' && cupPhases.length > 0 && (
        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-bold text-gray-200">📅 대회 일정 <span className="text-[11px] font-normal text-gray-500">({cupYear ?? BASE_FINALS_YEAR} · {MONTH_LABEL[format.schedule.monthWindow]})</span></h3>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {cupPhases.map((p) => (
              <div key={p.key} className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px]">
                <span className="text-gray-300">{p.label}</span>
                <span className="tabular-nums text-gray-400">{formatKoreanDate(p.start)}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {!result ? (
        <GlassCard className="p-8 text-center text-sm text-gray-400">
          <strong className="text-gray-300">캘린더</strong>에서 이 대회의 <strong className="text-emerald-300">조추첨 진행하기</strong>를 눌러 조추첨부터 우승까지 진행하세요.
        </GlassCard>
      ) : (
        <>
          {/* 일정 진행: 월드컵 ScheduleStage와 동형(상태·타임라인·다음경기·결과피드·통계·우승) + 예선 요약 */}
          {view === 'progress' && (
            <>
              <ContinentalProgressView result={result} format={format} />
              <QualSummaryCard />
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

          {/* 토너먼트(녹아웃) + 우승 */}
          {view === 'knockout' && (
            <>
              {fullyRevealed && (
                <GlassCard strong className="p-5 text-center">
                  <p className="text-[11px] text-gray-400">🏆 우승</p>
                  <div className="my-1 flex items-center justify-center text-lg font-bold text-amber-300"><TeamLink teamId={result.champion} /></div>
                  <p className="text-[11px] text-gray-500">준우승 <TeamLink teamId={result.runnerUp} />{result.third && <> · 3위 <TeamLink teamId={result.third} /></>}</p>
                </GlassCard>
              )}
              <GlassCard className="p-4">
                <h3 className="mb-3 text-sm font-bold text-gray-200">녹아웃 대진표 <span className="text-[11px] font-normal text-gray-500">(경기를 누르면 상세)</span></h3>
                <CupBracketView knockout={result.knockout} format={format} revealedRounds={revealedKoRounds} />
              </GlassCard>
            </>
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
              />
            ) : (
              <GlassCard className="p-8 text-center text-[11px] text-gray-500">
                📊 진출·우승 확률을 계산하고 있어요… <span className="mt-2 block"><GlassButton onClick={() => computeProbabilities()}>📊 우승 확률 계산</GlassButton></span>
              </GlassCard>
            )
          )}
        </>
      )}
    </div>
  )
}
