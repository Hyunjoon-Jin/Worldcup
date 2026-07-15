import { useEffect, useMemo, useState } from 'react'
import { ALL_NATIONS_BY_ID } from '../../data/nations'
import { FlagIcon } from '../common/FlagIcon'

/**
 * 지역예선 조추첨 애니메이션 리빌 (전 대륙). 시드로 이미 확정된 조 편성을 본선 조추첨처럼 포트별로
 * 한 팀씩 뽑아 공개한다(결과는 결정적·재현 가능, 연출만 추가). 각 조는 FIFA 랭킹순으로 포트를
 * 나눠 한 팀씩 배정되므로, 조별 멤버를 랭킹순 정렬하면 index가 곧 포트 번호가 된다.
 */
export function QualDrawReveal({
  confedLabel,
  stageName,
  groupsByPot,
  groupLabels,
  potCount,
  onClose,
}: {
  confedLabel: string
  stageName: string
  /** 각 조의 멤버(랭킹순 정렬 = 포트 순). groupsByPot[g][p] = g조의 포트 p 팀. */
  groupsByPot: string[][]
  groupLabels: string[]
  potCount: number
  /** 닫기 콜백(온디맨드 조추첨용). 필수 스테이지 내용으로 쓸 때는 생략하면 닫기 버튼이 사라진다. */
  onClose?: () => void
}) {
  // 추첨 순서: 포트 1부터, 각 포트 안에서 조 A→마지막 조 순으로 한 팀씩.
  const order = useMemo(() => {
    const seq: { g: number; p: number; teamId: string }[] = []
    for (let p = 0; p < potCount; p++) {
      for (let g = 0; g < groupsByPot.length; g++) {
        const teamId = groupsByPot[g]?.[p]
        if (teamId) seq.push({ g, p, teamId })
      }
    }
    return seq
  }, [groupsByPot, potCount])

  const [drawn, setDrawn] = useState(0)
  const [auto, setAuto] = useState(false)
  const done = drawn >= order.length

  useEffect(() => {
    if (!auto || done) return
    const t = setTimeout(() => setDrawn((n) => Math.min(order.length, n + 1)), 480)
    return () => clearTimeout(t)
  }, [auto, drawn, done, order.length])

  const lastPick = drawn > 0 ? order[drawn - 1] : null

  // 조별로 이미 뽑힌 팀ID 집합(빠른 조회).
  const revealedByGroup = useMemo(() => {
    const map: Record<number, Set<string>> = {}
    for (let i = 0; i < drawn; i++) {
      const { g, teamId } = order[i]
      ;(map[g] ??= new Set()).add(teamId)
    }
    return map
  }, [drawn, order])

  return (
    <div className="mb-3 rounded-xl border border-violet-400/30 bg-violet-500/[0.08] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-violet-200">
          🎬 {confedLabel} {stageName} 조추첨{' '}
          <span className="font-normal text-gray-400">
            ({drawn}/{order.length})
          </span>
        </h4>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setDrawn((n) => Math.min(order.length, n + 1))}
            disabled={done}
            className="rounded bg-violet-500/25 px-2 py-1 text-[11px] font-bold text-violet-100 hover:bg-violet-500/40 disabled:opacity-30"
          >
            🎩 다음 팀 뽑기
          </button>
          <button
            onClick={() => setAuto((a) => !a)}
            disabled={done}
            className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:bg-white/20 disabled:opacity-30"
          >
            {auto ? '⏸ 멈춤' : '⏩ 자동'}
          </button>
          <button
            onClick={() => {
              setAuto(false)
              setDrawn(order.length)
            }}
            disabled={done}
            className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:bg-white/20 disabled:opacity-30"
          >
            ⏭ 전체
          </button>
          <button
            onClick={() => {
              setAuto(false)
              setDrawn(0)
            }}
            className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:bg-white/20"
          >
            ↺
          </button>
          {onClose && (
            <button onClick={onClose} className="rounded bg-white/10 px-2 py-1 text-[11px] text-gray-400 hover:bg-white/20">
              ✕ 닫기
            </button>
          )}
        </div>
      </div>

      {/* 방금 뽑힌 팀 하이라이트 */}
      <div className="mb-2 h-8 rounded-lg bg-black/20 px-3 text-center leading-8">
        {lastPick ? (
          <span className="text-sm font-bold text-white">
            <span className="text-violet-300">포트 {lastPick.p + 1}</span> ·{' '}
            {ALL_NATIONS_BY_ID[lastPick.teamId]?.nameKo ?? lastPick.teamId} →{' '}
            <span className="text-emerald-300">{groupLabels[lastPick.g]}</span>
          </span>
        ) : (
          <span className="text-xs text-gray-500">‘다음 팀 뽑기’ 또는 ‘자동’을 눌러 조추첨을 시작하세요.</span>
        )}
      </div>

      {/* 조별 채워지는 현황 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {groupsByPot.map((members, g) => (
          <div key={g} className="rounded-lg bg-white/5 p-2">
            <p className="mb-1 text-[10px] font-bold text-gray-300">{groupLabels[g]}</p>
            <div className="space-y-0.5">
              {Array.from({ length: potCount }, (_, p) => {
                const teamId = members[p]
                const revealed = teamId && revealedByGroup[g]?.has(teamId)
                const isLast = lastPick && lastPick.g === g && lastPick.p === p
                return (
                  <div
                    key={p}
                    className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] ${
                      isLast ? 'bg-violet-500/30 text-white' : revealed ? 'text-gray-200' : 'text-gray-600'
                    }`}
                  >
                    <span className="w-3 shrink-0 text-center text-[8px] text-violet-300/70">{p + 1}</span>
                    {revealed ? (
                      <>
                        <FlagIcon iso2={ALL_NATIONS_BY_ID[teamId]?.iso2 ?? ''} className="h-2 w-3 shrink-0" />
                        <span className="truncate">{ALL_NATIONS_BY_ID[teamId]?.nameKo ?? teamId}</span>
                      </>
                    ) : (
                      <span className="text-gray-600">추첨 대기…</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {done && (
        <p className="mt-2 text-center text-[11px] font-bold text-emerald-300">
          ✅ 조추첨 완료 — 아래에서 조별 순위·경기를 진행해 보세요.
        </p>
      )}
    </div>
  )
}
