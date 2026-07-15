import { useMemo, useState } from 'react'
import { ALL_NATIONS, ALL_NATIONS_BY_ID } from '../../data/nations'
import { CONFEDERATION_LABEL_KO } from '../../data/teams'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { FlagIcon } from '../common/FlagIcon'
import { ProbBar } from '../probability/ProbBar'
import { STAGES, QUALIFY_STAGE } from '../probability/probabilityStages'
import { useProbabilityChain } from '../probability/useProbabilityChain'
import { useMyTeamStore, MY_TEAM_BUFF_LEVELS, MY_TEAM_BUFF_LABEL } from '../../store/useMyTeamStore'
import { useQualificationStore } from '../../store/useQualificationStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useSelectionStore } from '../../store/useSelectionStore'
import { useLiveFifaRanking, useLiveRankLookup } from '../ranking/useLiveFifaRanking'
import { getRatings } from '../../engine/matchEngine'
import { isCurrentHost } from '../../engine/hostContext'
import type { MatchResult } from '../../types/match'

/** 내 팀 관점의 한 경기 결과 행. */
function MatchRow({ m, myTeamId, label }: { m: MatchResult & { wentToPenalties?: boolean; winnerTeamId?: string }; myTeamId: string; label: string }) {
  const isHome = m.homeTeamId === myTeamId
  const oppId = isHome ? m.awayTeamId : m.homeTeamId
  const gf = isHome ? m.homeGoals : m.awayGoals
  const ga = isHome ? m.awayGoals : m.homeGoals
  const opp = ALL_NATIONS_BY_ID[oppId]
  let outcome: '승' | '무' | '패'
  if (m.wentToPenalties && m.winnerTeamId) outcome = m.winnerTeamId === myTeamId ? '승' : '패'
  else outcome = gf > ga ? '승' : gf < ga ? '패' : '무'
  const oColor = outcome === '승' ? 'text-emerald-300' : outcome === '패' ? 'text-red-300' : 'text-gray-400'
  const oBg = outcome === '승' ? 'bg-emerald-500/15' : outcome === '패' ? 'bg-red-500/15' : 'bg-white/10'
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">
      <span className={`w-6 shrink-0 rounded text-center text-[10px] font-bold ${oColor} ${oBg}`}>{outcome}</span>
      <span className="w-16 shrink-0 text-[10px] text-gray-500">{label}</span>
      <span className="flex-1 truncate text-gray-300">
        {isHome ? '' : '@ '}
        {opp?.nameKo ?? oppId}
      </span>
      <span className="shrink-0 font-bold tabular-nums text-white">
        {gf}-{ga}
        {m.wentToPenalties && <span className="ml-0.5 text-[9px] text-amber-300">(PK)</span>}
      </span>
    </div>
  )
}

/** 내 팀을 아직 안 골랐을 때의 선택기. */
function TeamPicker({ onPick }: { onPick: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const liveRank = useLiveRankLookup()
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ALL_NATIONS.filter((n) => {
      if (!q) return true
      return n.nameKo.includes(query.trim()) || n.nameEn.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)
    }).sort((a, b) => liveRank(a.id, a.fifaRankApprox) - liveRank(b.id, b.fifaRankApprox))
  }, [query, liveRank])
  return (
    <GlassCard strong className="flex flex-col gap-4 p-5">
      <div className="text-center">
        <p className="text-2xl">⭐</p>
        <p className="mt-1 text-sm font-semibold text-white">응원할 ‘내 팀’을 골라 주세요</p>
        <p className="mt-1 text-xs text-gray-400">
          시뮬레이션을 시작하기 전에 내 팀을 정하면, 진행 내내 내 팀의 정보·경기 결과·실시간 확률을 여기서 볼 수 있어요.
        </p>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="국가 검색 (한글·영문·코드)"
        aria-label="내 팀 국가 검색"
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-amber-400/50 focus:outline-none"
      />
      <div className="grid max-h-[46vh] grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
        {list.map((n) => (
          <button
            key={n.id}
            onClick={() => onPick(n.id)}
            className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2 text-left text-xs hover:bg-amber-400/15"
          >
            <FlagIcon iso2={n.iso2} className="h-3.5 w-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-gray-100">{n.nameKo}</span>
            <span className="shrink-0 text-[10px] text-gray-500">{liveRank(n.id, n.fifaRankApprox)}위</span>
          </button>
        ))}
        {list.length === 0 && <p className="col-span-full py-6 text-center text-xs text-gray-500">검색 결과가 없습니다.</p>}
      </div>
    </GlassCard>
  )
}

const CHAIN = [QUALIFY_STAGE, ...STAGES]

/** '내 팀' 중심 탭 — 내 팀 정보 · 경기 결과 · 실시간 진출/우승 확률을 한 화면에 모은다. */
export function MyTeamTab() {
  const myTeamId = useMyTeamStore((s) => s.myTeamId)
  const setMyTeam = useMyTeamStore((s) => s.setMyTeam)
  const clearMyTeam = useMyTeamStore((s) => s.clearMyTeam)
  const buff = useMyTeamStore((s) => s.buff)
  const setBuff = useMyTeamStore((s) => s.setBuff)
  const selectTeam = useSelectionStore((s) => s.selectTeam)
  const result = useQualificationStore((s) => s.result)
  const revealed = useQualificationStore((s) => s.revealed)
  const groupMatches = useProgressStore((s) => s.groupMatches)
  const knockoutSlots = useProgressStore((s) => s.knockoutSlots)
  const { rows, mode } = useProbabilityChain()

  const team = myTeamId ? ALL_NATIONS_BY_ID[myTeamId] : null
  // 예선·본선 진행이 반영된 라이브 FIFA 순위(단일 출처). 진행 이력이 없으면 정적 근사 순위로 대체.
  const { rankByTeam: liveRankByTeam } = useLiveFifaRanking()
  const liveRank = myTeamId ? liveRankByTeam[myTeamId] : undefined
  // buff 변경 시 표시 능력치도 갱신되도록 의존성에 buff 포함(getRatings가 store에서 버프를 읽음).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ratings = useMemo(() => (myTeamId ? getRatings(myTeamId) : null), [myTeamId, buff])

  // 예선 경기(내 팀, 공개된 라운드까지)
  const qualMatches = useMemo(() => {
    if (!result || !myTeamId || !team) return []
    const r = result.byConfederation[team.confederation]
    if (!r) return []
    // 공개 라운드 미지정 = 아직 시작 전(전체 공개로 오인해 스포일러가 되지 않게, #8).
    const rev = revealed[team.confederation] ?? 0
    return r.matches
      .filter((m) => (m.homeTeamId === myTeamId || m.awayTeamId === myTeamId) && m.matchday <= rev)
      .sort((a, b) => a.matchday - b.matchday)
  }, [result, revealed, myTeamId, team])

  // 본선 조별 경기(내 팀)
  const myGroupMatches = useMemo(
    () => groupMatches.filter((m) => m.homeTeamId === myTeamId || m.awayTeamId === myTeamId),
    [groupMatches, myTeamId],
  )
  // 본선 토너먼트 경기(내 팀)
  const myKoMatches = useMemo(
    () =>
      Object.values(knockoutSlots)
        .map((s) => s.result)
        .filter((m): m is NonNullable<typeof m> => m != null && (m.homeTeamId === myTeamId || m.awayTeamId === myTeamId)),
    [knockoutSlots, myTeamId],
  )

  const myRow = rows.find((r) => r.teamId === myTeamId) ?? null
  const eliminatedInQual = mode === 'finals' && !myRow // 본선 시뮬이 있는데 내 팀이 없으면 예선 탈락

  if (!myTeamId || !team) {
    return <TeamPicker onPick={setMyTeam} />
  }

  const KO_LABEL: Record<string, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위', FINAL: '결승' }

  return (
    <div className="flex flex-col gap-4">
      {/* 내 팀 헤더 */}
      <GlassCard strong className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <FlagIcon iso2={team.iso2} className="h-12 w-16 shrink-0 rounded" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-2xl font-bold tracking-wide text-white">{team.nameKo}</h2>
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">⭐ 내 팀</span>
              {isCurrentHost(team.id) && <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-300">개최국</span>}
            </div>
            <p className="mt-0.5 text-xs text-gray-400">
              {team.nameEn} · {CONFEDERATION_LABEL_KO[team.confederation]} · FIFA {liveRank ?? team.fifaRankApprox}위
            </p>
          </div>
          <div className="flex gap-2">
            <GlassButton variant="ghost" onClick={() => selectTeam(team.id)} title="국가 상세 페이지 열기">📄 상세</GlassButton>
            <GlassButton variant="ghost" onClick={clearMyTeam} title="내 팀 해제">✕ 해제</GlassButton>
          </div>
        </div>
        {ratings && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {([['공격', ratings.attack], ['수비', ratings.defense], ['종합', ratings.overall]] as const).map(([label, v]) => (
              <div key={label} className="rounded-lg bg-white/5 py-2">
                <div className="text-lg font-bold tabular-nums text-white">{Math.round(v)}</div>
                <div className="text-[10px] text-gray-500">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* 내 팀 버프 — 응원 팀에 능력치 가점을 줘 유리하게 진행 */}
        <div className="mt-4 rounded-lg bg-amber-400/[0.07] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-amber-300">⚡ 내 팀 버프</span>
            <span className="text-[10px] text-gray-500">공격·수비·종합에 가점(예선·본선·확률 전체 반영)</span>
          </div>
          <div className="flex rounded-lg bg-white/5 p-0.5" role="group" aria-label="내 팀 버프 단계">
            {MY_TEAM_BUFF_LEVELS.map((lv) => (
              <button
                key={lv}
                onClick={() => setBuff(lv)}
                aria-pressed={buff === lv}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  buff === lv ? 'bg-amber-500/30 text-amber-100' : 'text-gray-400 hover:text-white'
                }`}
              >
                {MY_TEAM_BUFF_LABEL[lv]}
              </button>
            ))}
          </div>
          {buff > 0 && (
            <p className="mt-1.5 text-[10px] text-amber-300/80">
              현재 <strong>+{buff}</strong> 적용 중. 예선/확률에 반영하려면 재시뮬레이션·확률 재계산이 필요합니다.
            </p>
          )}
        </div>
      </GlassCard>

      {/* 실시간 진출/우승 확률 */}
      <GlassCard className="p-4">
        <p className="mb-3 text-sm font-bold text-amber-300">📊 실시간 진출 확률</p>
        {eliminatedInQual ? (
          <p className="rounded-lg bg-red-500/10 px-3 py-4 text-center text-sm text-red-300">💔 이번 대회 본선 진출에 실패했습니다.</p>
        ) : myRow ? (
          <div className="space-y-1.5">
            {CHAIN.map((s) => {
              const v = s.key === 'qualifyPct' ? myRow.qualifyPct : myRow.finals ? myRow.finals[s.key] : null
              return v == null ? (
                <div key={s.key} className="flex items-center gap-2 text-[11px] text-gray-500">
                  <span className="w-14 shrink-0">{s.label}</span>
                  <span className="flex-1 text-right">조추첨 후 표시</span>
                </div>
              ) : (
                <ProbBar key={s.key} pct={v} color={s.color} label={s.label} />
              )
            })}
            {mode === 'qualification' && (
              <p className="pt-1 text-[10px] text-gray-500">32강~우승 확률은 조추첨 이후 표시됩니다.</p>
            )}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-gray-500">
            지역예선을 시뮬레이션하면 내 팀의 본선 진출 확률이 표시됩니다.
          </p>
        )}
      </GlassCard>

      {/* 내 팀 경기 결과 */}
      <GlassCard className="p-4">
        <p className="mb-3 text-sm font-bold text-sky-300">⚽ 내 팀 경기 결과</p>
        {qualMatches.length === 0 && myGroupMatches.length === 0 && myKoMatches.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">아직 진행된 내 팀 경기가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {qualMatches.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-gray-400">지역예선</p>
                <div className="space-y-1">
                  {qualMatches.map((m, i) => (
                    <MatchRow key={`q${i}`} m={m} myTeamId={myTeamId} label={`MD${m.matchday}`} />
                  ))}
                </div>
              </div>
            )}
            {myGroupMatches.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-gray-400">본선 조별리그</p>
                <div className="space-y-1">
                  {myGroupMatches.map((m, i) => (
                    <MatchRow key={`g${i}`} m={m} myTeamId={myTeamId} label={`${m.group}조 MD${m.matchday}`} />
                  ))}
                </div>
              </div>
            )}
            {myKoMatches.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-gray-400">본선 토너먼트</p>
                <div className="space-y-1">
                  {myKoMatches.map((m, i) => (
                    <MatchRow key={`k${i}`} m={m} myTeamId={myTeamId} label={KO_LABEL[m.round] ?? m.round} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </GlassCard>

      <div className="text-center">
        <GlassButton variant="ghost" onClick={clearMyTeam}>다른 팀 선택하기</GlassButton>
      </div>
    </div>
  )
}
