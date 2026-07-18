import { useState } from 'react'
import { GlassCard } from '../common/GlassCard'
import { GlassButton } from '../common/GlassButton'
import { ALL_NATIONS_BY_ID as TEAMS_BY_ID } from '../../data/nations'
import { useCupSaveSlotsStore } from '../../store/useCupSaveSlotsStore'

function formatSavedAt(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 대륙컵 저장 슬롯 UI — 월드컵 SaveSlotsPanel과 동형. 현재 대륙컵을 저장/불러오기/삭제한다. */
export function CupSaveSlotsPanel({ champion, canSave }: { champion?: string | null; canSave: boolean }) {
  const slots = useCupSaveSlotsStore((s) => s.slots)
  const saveCurrent = useCupSaveSlotsStore((s) => s.saveCurrent)
  const load = useCupSaveSlotsStore((s) => s.load)
  const remove = useCupSaveSlotsStore((s) => s.remove)
  const [label, setLabel] = useState('')

  const defaultLabel = champion ? `${TEAMS_BY_ID[champion]?.nameKo ?? champion} 우승` : '진행 중'

  return (
    <GlassCard className="p-4">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-gray-200">
          <span>💾 대회 저장 슬롯 {slots.length > 0 && <span className="text-gray-500">({slots.length})</span>}</span>
          <span className="text-xs text-gray-500 transition-transform group-open:rotate-180">▾</span>
        </summary>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={defaultLabel}
            aria-label="저장 이름"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-emerald-400/50 focus:outline-none"
          />
          <GlassButton
            variant="ghost"
            onClick={() => {
              saveCurrent(label || defaultLabel)
              setLabel('')
            }}
            disabled={!canSave}
          >
            현재 대회 저장
          </GlassButton>
        </div>

        {slots.length === 0 ? (
          <p className="mt-3 text-center text-[11px] text-gray-500">저장된 대회가 없습니다.</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {slots.map((slot) => (
              <div key={slot.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-200">{slot.label}</p>
                  <p className="text-[10px] text-gray-500">{formatSavedAt(slot.savedAt)} 저장</p>
                </div>
                <button
                  onClick={() => load(slot.id)}
                  className="shrink-0 rounded-md bg-emerald-500/20 px-2.5 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/30"
                >
                  불러오기
                </button>
                <button
                  onClick={() => remove(slot.id)}
                  aria-label="삭제"
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] text-gray-500 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </details>
    </GlassCard>
  )
}
