import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../../data/nations'
import { CONFEDERATION_LABEL_KO } from '../../data/teams'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { FlagIcon } from '../common/FlagIcon'
import { GroupSlotCard } from '../draw/GroupSlotCard'
import { useContinentalStore } from '../../store/useContinentalStore'
import type { CupResult } from '../../engine/continental/runCup'
import type { CupFormat } from '../../data/continental/formats'

interface DrawInfo {
  pots: string[][]
  potOf: Map<string, number>
  groupOf: Map<string, number>
}

/**
 * 대륙컵 조추첨 연출(월드컵 DrawStage와 동형) — 확정된 조편성을 '팀을 하나씩 뽑는' 연출로 공개한다.
 * 포트1→N 순서로, 각 포트에서 A조부터 순서대로 한 팀씩 뽑는다(개최국은 포트1 시드로 A조부터 사전 배정).
 * 결과 자체는 결정론적(runCup)이며 여기서는 공개 순서만 연출한다.
 */
export function CupDrawCeremony({
  result,
  format,
  drawInfo,
  hostIds,
  onComplete,
  complete = false,
}: {
  result: CupResult
  format: CupFormat
  drawInfo: DrawInfo
  hostIds: string[]
  onComplete?: () => void
  /** 대회가 이미 시작돼(stage>0) 조추첨이 확정된 상태면 전체 공개로 고정 표시한다. */
  complete?: boolean
}) {
  const storeRevealCount = useContinentalStore((s) => s.drawRevealCount)
  const revealDrawTeam = useContinentalStore((s) => s.revealDrawTeam)
  const undoDrawTeam = useContinentalStore((s) => s.undoDrawTeam)
  const revealAllDraw = useContinentalStore((s) => s.revealAllDraw)

  // 뽑기 순서: 포트1→N, 각 포트에서 A조부터. (drawInfo.potOf/groupOf가 실제 조추첨 배정을 반영)
  const sequence = useMemo(() => {
    const seq: { teamId: string; pot: number; group: number }[] = []
    for (let p = 0; p < format.teamsPerGroup; p++) {
      for (let g = 0; g < format.groups; g++) {
        const t = result.groups[g]?.teams.find((tid) => (drawInfo.potOf.get(tid) ?? -1) === p)
        if (t) seq.push({ teamId: t, pot: p, group: g })
      }
    }
    return seq
  }, [result, format, drawInfo])

  const total = sequence.length
  const revealCount = complete ? total : storeRevealCount
  const done = revealCount >= total
  const last = revealCount > 0 ? sequence[revealCount - 1] : null
  const next = revealCount < total ? sequence[revealCount] : null
  const lastTeam = last ? TEAMS_BY_ID[last.teamId] : null
  const groupLetter = (g: number) => String.fromCharCode(65 + g)

  // 조별 슬롯: 각 조에 포트 순서대로 자리를 만들고, 공개된 팀만 채운다(미공개는 null).
  const revealedIndex = (teamId: string) => sequence.findIndex((s) => s.teamId === teamId)
  const groupSlots = result.groups.map((g) => {
    const slots: (string | null)[] = []
    for (let p = 0; p < format.teamsPerGroup; p++) {
      const t = g.teams.find((tid) => (drawInfo.potOf.get(tid) ?? -1) === p) ?? null
      slots.push(t && revealedIndex(t) < revealCount ? t : null)
    }
    return { group: g.groupIndex, slots }
  })

  return (
    <div className="flex flex-col gap-5">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-3 text-sm text-gray-300">
          {done
            ? `조추첨이 완료되었습니다! 대륙연맹 규정을 모두 만족하는 ${format.groups}개 조가 확정되었습니다.`
            : next
              ? `포트 ${next.pot + 1}에서 그룹 ${groupLetter(next.group)}에 배정될 국가를 뽑습니다.`
              : ''}
        </p>
        <div className="flex h-24 items-center justify-center">
          <AnimatePresence mode="wait">
            {last && lastTeam && (
              <motion.div
                key={last.teamId + revealCount}
                initial={{ opacity: 0, scale: 0.5, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="glass flex items-center gap-3 rounded-2xl px-6 py-3"
              >
                <FlagIcon iso2={lastTeam.iso2} className="h-8 w-12" />
                <div className="text-left">
                  <div className="font-display text-xl font-semibold tracking-wide text-white">{lastTeam.nameKo}</div>
                  <div className="text-xs text-gray-400">
                    {CONFEDERATION_LABEL_KO[lastTeam.confederation]} · 조 {groupLetter(last.group)} · 포트 {last.pot + 1}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          {!done ? (
            <GlassButton onClick={revealDrawTeam}>🎱 다음 국가 뽑기</GlassButton>
          ) : (
            <GlassButton onClick={onComplete}>일정 진행으로 이동 →</GlassButton>
          )}
          <GlassButton variant="ghost" onClick={undoDrawTeam} disabled={revealCount === 0}>↩ 되돌리기</GlassButton>
          {!done && <GlassButton variant="ghost" onClick={revealAllDraw}>⏭ 전체 공개</GlassButton>}
        </div>
      </GlassCard>

      {/* 모바일: 지금 배정 중인 조(월드컵 DrawStage와 동형) */}
      {!done && next && (
        <div className="sm:hidden">
          <p className="mb-2 text-center text-xs text-gray-400">📍 지금 배정 중인 조</p>
          <GroupSlotCard letter={groupLetter(next.group)} teams={groupSlots.find((g) => g.group === next.group)?.slots ?? []} highlight />
          <div className="mt-3 flex justify-center gap-2">
            {drawInfo.pots.map((pot, pi) => {
              const remaining = pot.filter((tid) => revealedIndex(tid) >= revealCount).length
              return (
                <span key={pi} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${next.pot === pi ? 'bg-sky-400/20 text-sky-300' : 'bg-white/5 text-gray-400'}`}>
                  포트{pi + 1} {remaining}팀
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* 조 편성 보드(공개된 팀만 채워짐 · 월드컵 조추첨 GroupBoard와 동형) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {groupSlots.map(({ group, slots }) => (
          <GroupSlotCard key={group} letter={groupLetter(group)} teams={slots} highlight={!done && next?.group === group} />
        ))}
      </div>

      {/* 시드 포트(남은 팀 · 뽑을 포트 강조 · 월드컵 PotTray와 동형) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {drawInfo.pots.map((pot, pi) => {
          const remaining = pot.filter((tid) => revealedIndex(tid) >= revealCount).length
          return (
            <GlassCard key={pi} className={`p-3 ${!done && next?.pot === pi ? 'ring-2 ring-sky-300/70' : ''}`}>
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-sky-300/90">
                <span>포트 {pi + 1}</span>
                <span className="text-gray-400">{remaining}팀 남음</span>
              </div>
              <ul className="space-y-1">
                {pot.map((tid) => {
                  const team = TEAMS_BY_ID[tid]
                  if (!team) return null
                  const host = hostIds.includes(tid)
                  const picked = revealedIndex(tid) < revealCount
                  const placed = picked && !host
                  return (
                    <li key={tid} className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] ${placed ? 'text-gray-600 line-through opacity-40' : 'text-gray-100'}`}>
                      <FlagIcon iso2={team.iso2} className="h-2.5 w-3.5" />
                      <span className="truncate">{team.nameKo}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        <span className="text-[9px] text-gray-500">{team.fifaRankApprox ?? '-'}위</span>
                        {host && <span className="text-[9px] text-amber-300">개최국</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </GlassCard>
          )
        })}
      </div>

      {/* 조추첨 규정 안내(월드컵 DrawStage와 동형) */}
      <GlassCard className="p-4 text-xs leading-relaxed text-gray-400">
        <strong className="text-gray-300">조추첨 규정:</strong> 개최국은 포트1(각 조 1번 시드)로 사전 고정됩니다.
        이후 능력치 등급별로 {format.teamsPerGroup}개 포트를 만들어, 포트1→{format.teamsPerGroup} 순서로 각 조에 한 팀씩 배정합니다.
      </GlassCard>
    </div>
  )
}
