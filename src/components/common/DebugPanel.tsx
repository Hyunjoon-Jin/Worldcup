import { useState } from 'react'
import { useDrawStore } from '../../store/useDrawStore'
import { useProgressStore } from '../../store/useProgressStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import { useMomentumStore } from '../../store/useMomentumStore'

/**
 * 개발 모드 전용 디버그 패널 (F7). 시드·시뮬레이션 반복·모멘텀 등 내부 상태를 확인해
 * 이상한 결과의 원인 추적을 돕는다. 프로덕션 빌드에서는 import.meta.env.DEV가 false라
 * 렌더되지 않는다.
 */
export function DebugPanel() {
  const [open, setOpen] = useState(false)
  const seed = useDrawStore((s) => s.seed)
  const phase = useProgressStore((s) => s.phase)
  const groupCount = useProgressStore((s) => s.groupMatches.length)
  const iterations = useSimulationStore((s) => s.iterations)
  const isComputing = useSimulationStore((s) => s.isComputing)
  const momentum = useMomentumStore((s) => s.offsets)

  if (!import.meta.env.DEV) return null

  const activeMomentum = Object.entries(momentum).filter(([, v]) => v !== 0)

  return (
    <div className="fixed right-3 bottom-3 z-[60] text-[11px]">
      {open ? (
        <div className="w-56 rounded-lg border border-white/10 bg-black/80 p-3 text-gray-300 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold text-emerald-300">🐛 Debug</span>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">
              ✕
            </button>
          </div>
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt className="text-gray-500">seed</dt>
              <dd className="font-mono text-gray-200">{seed ?? '(수동)'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">phase</dt>
              <dd>{phase}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">group matches</dt>
              <dd>{groupCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">iterations</dt>
              <dd>
                {iterations} {isComputing && '⏳'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">momentum≠0</dt>
              <dd>{activeMomentum.length}팀</dd>
            </div>
          </dl>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-black/60 px-2.5 py-1 text-gray-400 backdrop-blur hover:text-white"
        >
          🐛
        </button>
      )}
    </div>
  )
}
