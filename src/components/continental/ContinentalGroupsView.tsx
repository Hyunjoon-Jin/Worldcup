import { useMemo, useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { TeamLink } from '../common/TeamLink'
import { UpsetBadge } from '../common/UpsetBadge'
import { RulesHelp, type RuleItem } from '../common/RulesHelp'
import { GroupTable } from '../groups/GroupTable'
import { GroupHeatmap } from '../groups/GroupHeatmap'
import { GroupDifficultySummary } from '../groups/GroupDifficultySummary'
import { ThirdPlaceTable } from '../groups/ThirdPlaceTable'
import { GROUP_LETTERS } from '../../data/hostSlots'
import { classifyMatchUpset } from '../../engine/matchEngine'
import { analyzeGroupDifficulty } from '../../engine/groupAnalysis'
import { rankGroupTeams, rankThirdPlaceTeams } from '../../engine/tiebreakers'
import { useMyTeamStore } from '../../store/useMyTeamStore'
import { useMatchDetailStore, type MatchDetailRef } from '../../store/useMatchDetailStore'
import type { CupFormat } from '../../data/continental/formats'
import type { CupGroupResult, CupMatch, CupResult } from '../../engine/continental/runCup'
import type { QualificationStatus } from '../../engine/qualificationStatus'
import type { GroupLetter } from '../../types/group'
import type { GroupMatch } from '../../types/match'
import type { KnockoutRound } from '../../types/match'

const ROUND_LABEL: Record<KnockoutRound, string> = { R32: '32강', R16: '16강', QF: '8강', SF: '4강', THIRD: '3·4위전', FINAL: '결승' }

const TIER_BADGE: Record<string, { label: string; className: string }> = {
  death: { label: '🔥 죽음의 조', className: 'bg-red-500/20 text-red-300' },
  easy: { label: '🍯 꿀조', className: 'bg-emerald-500/20 text-emerald-300' },
}

const letterOf = (groupIndex: number): GroupLetter => GROUP_LETTERS[groupIndex] as GroupLetter

/** 대륙컵 조별 경기(공개분)를 월드컵 GroupTable/ThirdPlaceTable이 받는 GroupMatch로 변환. */
function toGroupMatches(groups: CupGroupResult[], revealedMd: number): GroupMatch[] {
  const out: GroupMatch[] = []
  for (const g of groups) {
    for (const m of g.matches) {
      if (m.matchday > revealedMd) continue
      out.push({
        group: letterOf(g.groupIndex),
        matchday: m.matchday as 1 | 2 | 3,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
      })
    }
  }
  return out
}

/**
 * 대륙컵 진출확정/탈락확정 판정 — 조별리그가 모두 공개된 뒤(revealedMd>=3) 확정만 계산한다.
 * 각 조 상위 advancePerGroup은 진출확정, best-thirds가 있으면 3위 팀들을 횡단 비교해 상위 bestThirds도
 * 진출확정, 나머지는 탈락확정. 진행 중이면 전부 미확정(배지 없음).
 */
function computeCupStatuses(result: CupResult, format: CupFormat, revealedMd: number): Record<string, QualificationStatus> {
  if (revealedMd < 3) return {}
  const status: Record<string, QualificationStatus> = {}
  const thirdByGroup: Partial<Record<GroupLetter, string>> = {}
  for (const g of result.groups) {
    const order = rankGroupTeams(g.teams, g.matches, format.groupTiebreak)
    order.forEach((id, i) => {
      if (i < format.advancePerGroup) status[id] = 'advancing'
      else status[id] = 'eliminated'
    })
    if (format.bestThirds > 0 && order[format.advancePerGroup]) thirdByGroup[letterOf(g.groupIndex)] = order[format.advancePerGroup]
  }
  if (format.bestThirds > 0) {
    const gm = toGroupMatches(result.groups, revealedMd)
    const ranked = rankThirdPlaceTeams(thirdByGroup, gm, format.bestThirds)
    for (const e of ranked) status[e.teamId] = e.qualified ? 'advancing' : 'eliminated'
  }
  return status
}

/** 대륙컵 대회 규정(월드컵 RulesHelp와 동일 UI, 대회별 규정 텍스트). */
function cupRules(format: CupFormat): RuleItem[] {
  const koLabel = ROUND_LABEL[format.knockout[0]] ?? '녹아웃'
  const advanceText = format.bestThirds > 0
    ? `${format.groups}개 조의 각 ${format.advancePerGroup}위(${format.groups * format.advancePerGroup}팀) + 각 조 3위 중 성적 상위 ${format.bestThirds}팀 = 총 ${format.groups * format.advancePerGroup + format.bestThirds}팀이 ${koLabel}에 진출합니다.`
    : `${format.groups}개 조의 각 조 상위 ${format.advancePerGroup}팀(총 ${format.groups * format.advancePerGroup}팀)이 ${koLabel}에 진출합니다.`
  const rules: RuleItem[] = [
    { q: `${koLabel}에는 몇 팀이 진출하나요?`, a: advanceText },
    {
      q: '조별리그 동률은 어떻게 정렬되나요?',
      a: format.groupTiebreak === 'h2h'
        ? '승점 다음 기준은 "동률팀 간 상호전적(승점 → 골득실 → 다득점)"이고, 그 다음에야 조 전체 골득실·다득점·FIFA 랭킹을 봅니다.'
        : '승점 → 조 전체 골득실 → 다득점 → FIFA 랭킹 순으로 정렬합니다.',
    },
    {
      q: '조추첨 제약은 무엇인가요?',
      a: `개최국은 포트1(각 조 1번 시드)로 사전 고정되고, 능력치 등급별로 ${format.teamsPerGroup}개 포트를 만들어 각 조에 포트마다 한 팀씩 배정됩니다.`,
    },
  ]
  if (format.bestThirds > 0) {
    rules.splice(1, 0, {
      q: '조 3위는 어떻게 진출 팀을 가리나요?',
      a: `${format.groups}개 조 3위팀을 승점 → 골득실 → 다득점 → FIFA 랭킹 순으로 횡단 비교해 상위 ${format.bestThirds}팀이 진출합니다.`,
    })
  }
  rules.push({
    q: '능력치/확률은 어떻게 계산되나요?',
    a: '팀별 공격·수비·컨디션 능력치를 바탕으로 포아송 분포로 득점을 시뮬레이션하고, 남은 경기를 수천 번 반복(몬테카를로)해 진출·우승 확률을 산출합니다. 조추첨 이후 결과는 모두 가상입니다.',
  })
  return rules
}

const cupGroupRef = (m: CupMatch): MatchDetailRef => ({
  kind: 'group',
  external: true,
  match: { group: 'A', matchday: 1, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeGoals: m.homeGoals, awayGoals: m.awayGoals },
})

/** 대륙컵 조 상세(월드컵 GroupDetailPage와 동형): 순위표 + 경기 일정/결과. */
function CupGroupDetail({ group, format, revealedMd, statusByTeam, onBack }: { group: CupGroupResult; format: CupFormat; revealedMd: number; statusByTeam: Record<string, QualificationStatus>; onBack: () => void }) {
  const selectMatch = useMatchDetailStore((s) => s.selectMatch)
  const letter = letterOf(group.groupIndex)
  const played = useMemo(() => toGroupMatches([group], revealedMd), [group, revealedMd])
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <GlassButton variant="ghost" onClick={onBack}>← 전체 조 보기</GlassButton>
        <h2 className="font-display text-xl font-semibold tracking-wide text-white">GROUP {letter}</h2>
      </div>
      <GlassCard className="p-4">
        <GroupTable teamIds={group.teams} matches={played} statusByTeam={statusByTeam} qualifyLine={format.advancePerGroup} />
      </GlassCard>
      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-bold text-sky-300">경기 일정 및 결과</h3>
        <div className="space-y-2">
          {group.matches.map((m, i) => {
            const revealed = m.matchday <= revealedMd
            const upsetInfo = revealed ? classifyMatchUpset(m.homeTeamId, m.awayTeamId, m.homeGoals, m.awayGoals) : null
            return (
              <div
                key={i}
                onClick={() => revealed && selectMatch(cupGroupRef(m))}
                className={`flex flex-col gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors sm:flex-row sm:items-center sm:justify-between ${revealed ? 'cursor-pointer hover:bg-white/10' : ''} ${upsetInfo?.upset ? 'bg-red-500/10 ring-1 ring-red-400/30' : 'bg-white/5'}`}
              >
                <div className="flex items-center justify-between sm:w-16 sm:shrink-0">
                  <span className="text-xs text-gray-400">MD{m.matchday}</span>
                  <span className="flex items-center gap-1.5 sm:hidden">
                    {upsetInfo && <UpsetBadge upset={upsetInfo.upset} surpriseDraw={upsetInfo.surpriseDraw} />}
                    <span className="text-xs text-gray-500">{revealed ? '종료' : '예정'}</span>
                  </span>
                </div>
                <div className="flex flex-1 items-center justify-center gap-3">
                  <TeamLink teamId={m.homeTeamId} wrap className="min-w-0" />
                  {revealed ? (
                    <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 font-bold text-white">{m.homeGoals} - {m.awayGoals}</span>
                  ) : (
                    <span className="shrink-0 text-gray-500">vs</span>
                  )}
                  <TeamLink teamId={m.awayTeamId} reverse wrap className="min-w-0" />
                </div>
                <span className="hidden shrink-0 items-center justify-end gap-1.5 sm:flex sm:w-24">
                  {upsetInfo && <UpsetBadge upset={upsetInfo.upset} surpriseDraw={upsetInfo.surpriseDraw} />}
                  <span className="text-xs text-gray-500">{revealed ? '종료' : '예정'}</span>
                </span>
              </div>
            )
          })}
        </div>
      </GlassCard>
    </div>
  )
}

/**
 * 대륙컵 조별리그 뷰 — 월드컵 GroupStageView와 **완전히 동일한** 구성으로, 같은 프레젠테이션 컴포넌트
 * (RulesHelp·GroupHeatmap·GroupDifficultySummary·ThirdPlaceTable·GroupTable·GroupDetailPage)를 재사용한다.
 */
export function ContinentalGroupsView({ result, format, revealedMd }: { result: CupResult; format: CupFormat; revealedMd: number }) {
  const [selected, setSelected] = useState<number | null>(null)
  const myTeamId = useMyTeamStore((s) => s.myTeamId)

  const groupLetters = useMemo(() => result.groups.map((g) => letterOf(g.groupIndex)), [result])
  const groupTeams = useMemo(
    () => Object.fromEntries(result.groups.map((g) => [letterOf(g.groupIndex), g.teams])) as Record<GroupLetter, string[]>,
    [result],
  )
  const matches = useMemo(() => toGroupMatches(result.groups, revealedMd), [result, revealedMd])
  const analysis = useMemo(() => analyzeGroupDifficulty(groupTeams), [groupTeams])
  const tierByGroup = useMemo(() => Object.fromEntries(analysis.map((a) => [a.group, a.tier])) as Record<GroupLetter, string>, [analysis])
  const statusByTeam = useMemo(() => computeCupStatuses(result, format, revealedMd), [result, format, revealedMd])
  const koLabel = ROUND_LABEL[format.knockout[0]] ?? '녹아웃'

  const selectedGroup = selected != null ? result.groups.find((g) => g.groupIndex === selected) : null
  if (selectedGroup) {
    return <CupGroupDetail group={selectedGroup} format={format} revealedMd={revealedMd} statusByTeam={statusByTeam} onBack={() => setSelected(null)} />
  }

  return (
    <div className="flex flex-col gap-5">
      <RulesHelp rules={cupRules(format)} />
      <GroupHeatmap analysis={analysis} groups={groupLetters} onSelect={(g) => setSelected(GROUP_LETTERS.indexOf(g))} />
      <GroupDifficultySummary analysis={analysis} groupTeams={groupTeams} />
      {format.bestThirds > 0 && (
        <ThirdPlaceTable groupTeams={groupTeams} matches={matches} statusByTeam={statusByTeam} groups={groupLetters} topN={format.bestThirds} roundLabel={koLabel} />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.groups.map((g) => {
          const letter = letterOf(g.groupIndex)
          const badge = TIER_BADGE[tierByGroup[letter]]
          return (
            <GlassCard
              key={g.groupIndex}
              className="cursor-pointer p-3 transition-transform hover:scale-[1.02] hover:ring-1 hover:ring-emerald-300/50"
              onClick={() => setSelected(g.groupIndex)}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-sm font-semibold tracking-wide text-emerald-300/90">GROUP {letter}</span>
                <div className="flex items-center gap-1.5">
                  {badge && <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${badge.className}`}>{badge.label}</span>}
                  <span className="text-[10px] text-gray-500">자세히 보기 →</span>
                </div>
              </div>
              <GroupTable
                teamIds={g.teams}
                matches={matches.filter((m) => m.group === letter)}
                statusByTeam={statusByTeam}
                qualifyLine={format.advancePerGroup}
                compact
              />
              {myTeamId && g.teams.includes(myTeamId) && (
                <p className="mt-1.5 text-[10px] text-sky-300">⭐ 내 팀이 속한 조</p>
              )}
            </GlassCard>
          )
        })}
      </div>
    </div>
  )
}
