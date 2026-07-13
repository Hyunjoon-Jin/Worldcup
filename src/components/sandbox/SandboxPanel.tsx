import { useMemo, useState } from 'react'
import { CONFEDERATION_LABEL_KO } from '../../data/teams'
import { ALL_NATIONS } from '../../data/nations'
import { FlagIcon } from '../common/FlagIcon'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { RatingSlider } from './RatingSlider'
import { useSandboxStore } from '../../store/useSandboxStore'

export function SandboxPanel() {
  const { overrides, setOverride, resetTeam, resetAll } = useSandboxStore()
  const [query, setQuery] = useState('')

  // 모든 참가국(본선 후보 48개국 + 예선 참가국 = 210개국)을 랭킹순으로 노출한다.
  const allNations = useMemo(
    () => [...ALL_NATIONS].sort((a, b) => a.fifaRankApprox - b.fifaRankApprox),
    [],
  )
  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allNations
    return allNations.filter((t) => t.nameKo.includes(q) || t.nameEn.toLowerCase().includes(q))
  }, [query, allNations])

  return (
    <GlassCard strong className="mb-6 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-emerald-300">🧪 샌드박스 모드 — 국가별 능력치 조정</h2>
          <p className="text-xs text-gray-400">
            공격/수비/컨디션을 조정하면 이후 시뮬레이션(경기 결과, 확률)에 즉시 반영됩니다. 조추첨에는 영향을 주지
            않습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="국가 검색…"
            className="glass rounded-lg px-3 py-1.5 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none"
          />
          <GlassButton variant="danger" onClick={resetAll}>
            전체 초기화
          </GlassButton>
        </div>
      </div>

      <div className="scrollbar-thin grid max-h-96 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {filteredTeams.map((team) => {
          const override = overrides[team.id]
          const ratings = { ...team.baseRatings, ...override }
          const isModified = !!override
          return (
            <div key={team.id} className={`rounded-lg p-2 ${isModified ? 'bg-emerald-400/10 ring-1 ring-emerald-400/30' : 'bg-white/[0.03]'}`}>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-100">
                  <FlagIcon iso2={team.iso2} className="h-3 w-4" />
                  {team.nameKo}
                  <span className="text-[10px] text-gray-500">{CONFEDERATION_LABEL_KO[team.confederation]}</span>
                </span>
                {isModified && (
                  <button className="text-[10px] text-gray-400 hover:text-white" onClick={() => resetTeam(team.id)}>
                    ↺ 초기화
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <RatingSlider label="공격" value={ratings.attack} onChange={(v) => setOverride(team.id, { attack: v })} />
                <RatingSlider label="수비" value={ratings.defense} onChange={(v) => setOverride(team.id, { defense: v })} />
                <RatingSlider label="컨디션" value={ratings.form} onChange={(v) => setOverride(team.id, { form: v })} />
              </div>
            </div>
          )
        })}
      </div>
    </GlassCard>
  )
}
