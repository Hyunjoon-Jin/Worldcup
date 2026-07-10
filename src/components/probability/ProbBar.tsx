export function ProbBar({ pct, color, label }: { pct: number; color: string; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-14 shrink-0 text-[11px] text-gray-400">{label}</span>}
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`, background: color }} />
      </div>
      <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-gray-300">{pct.toFixed(1)}%</span>
    </div>
  )
}
