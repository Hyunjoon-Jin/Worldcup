import { AnimatePresence, motion } from 'framer-motion'
import { useDrawStore } from '../../store/useDrawStore'
import { TEAMS_BY_ID, CONFEDERATION_LABEL_KO } from '../../data/teams'
import { findNextSlot } from '../../engine/drawEngine'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { FlagIcon } from '../common/FlagIcon'
import { PotTray } from './PotTray'
import { GroupBoard } from './GroupBoard'

export function DrawStage({ onComplete }: { onComplete?: () => void }) {
  const { state, log, isComplete, drawOne, undoLast, reset } = useDrawStore()
  const nextSlot = findNextSlot(state)
  const lastEntry = log[log.length - 1]
  const lastTeam = lastEntry ? TEAMS_BY_ID[lastEntry.teamId] : null

  return (
    <div className="flex flex-col gap-6">
      <GlassCard strong className="p-5 text-center">
        <p className="mb-3 text-sm text-gray-300">
          {isComplete
            ? '조추첨이 완료되었습니다! 대륙연맹 규정을 모두 만족하는 12개 조가 확정되었습니다.'
            : nextSlot
              ? `포트 ${nextSlot.pot}에서 그룹 ${nextSlot.group}에 배정될 국가를 뽑습니다.`
              : ''}
        </p>

        <div className="flex h-24 items-center justify-center">
          <AnimatePresence mode="wait">
            {lastTeam && (
              <motion.div
                key={lastEntry.teamId + log.length}
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
                    {CONFEDERATION_LABEL_KO[lastTeam.confederation]} · 조 {lastEntry.group} · 포트 {lastEntry.pot}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          {!isComplete ? (
            <GlassButton onClick={drawOne}>🎱 다음 국가 뽑기</GlassButton>
          ) : (
            <GlassButton onClick={onComplete}>일정 진행으로 이동 →</GlassButton>
          )}
          <GlassButton variant="ghost" onClick={undoLast} disabled={log.length === 0}>
            ↩ 되돌리기
          </GlassButton>
          <GlassButton variant="danger" onClick={reset}>
            ⟲ 처음부터
          </GlassButton>
        </div>
      </GlassCard>

      <PotTray pots={state.pots} currentPot={nextSlot?.pot ?? null} />
      <GroupBoard groups={state.groups} highlightGroup={nextSlot?.group ?? null} />

      <GlassCard className="p-4 text-xs leading-relaxed text-gray-400">
        <strong className="text-gray-300">조추첨 규정:</strong> 개최국 3팀(멕시코=A1, 캐나다=B1, 미국=D1)은 사전
        고정됩니다. 이후 포트1→4 순서로 각 조에 한 팀씩 배정하며, 같은 대륙연맹 팀은 원칙적으로 한 조에 1팀까지만
        허용됩니다(유럽 UEFA는 예외적으로 최대 2팀). 배정이 규정을 위반하면 자동으로 다른 팀을 다시 뽑습니다.
      </GlassCard>
    </div>
  )
}
