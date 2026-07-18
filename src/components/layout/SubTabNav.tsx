interface SubTab {
  id: string
  label: string
  disabled?: boolean
}

interface SubTabNavProps {
  tabs: SubTab[]
  active: string
  onChange: (id: string) => void
  /** 접근성 라벨(어느 대회의 하위 탭인지). */
  ariaLabel?: string
}

/**
 * 최상위 탭(대회) 안의 하위 탭 바. 최상위 TabNav보다 한 단계 작고 은은한 스타일로 계층을 드러낸다
 * (대회 → 상세 화면: 조추첨/일정/조별리그/토너먼트/확률 등).
 */
export function SubTabNav({ tabs, active, onChange, ariaLabel = '대회 상세' }: SubTabNavProps) {
  return (
    <nav
      role="tablist"
      aria-label={ariaLabel}
      className="scrollbar-thin mb-4 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-all disabled:cursor-not-allowed disabled:opacity-30 sm:text-xs ${
            active === tab.id
              ? 'bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/40'
              : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
