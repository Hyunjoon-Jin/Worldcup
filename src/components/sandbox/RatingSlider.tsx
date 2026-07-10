interface RatingSliderProps {
  label: string
  value: number
  onChange: (value: number) => void
}

export function RatingSlider({ label, value, onChange }: RatingSliderProps) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-gray-400">
      <span className="w-8 shrink-0">{label}</span>
      <input
        type="range"
        min={20}
        max={99}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-20 accent-emerald-400 sm:w-24"
      />
      <span className="w-6 shrink-0 tabular-nums text-gray-200">{value}</span>
    </label>
  )
}
