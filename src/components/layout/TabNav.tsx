interface Tab {
  id: string
  label: string
  disabled?: boolean
}

interface TabNavProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}

export function TabNav({ tabs, active, onChange }: TabNavProps) {
  return (
    <nav
      role="tablist"
      aria-label="시뮬레이터 단계"
      className="glass scrollbar-thin mx-auto flex max-w-full gap-1 overflow-x-auto rounded-2xl p-1.5 sm:max-w-fit"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium whitespace-nowrap transition-all disabled:cursor-not-allowed disabled:opacity-30 sm:px-4 sm:text-sm ${
            active === tab.id
              ? 'bg-white/15 text-white shadow-inner ring-1 ring-white/20'
              : 'text-gray-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
