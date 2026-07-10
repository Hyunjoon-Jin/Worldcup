interface UpsetBadgeProps {
  upset: boolean
  surpriseDraw?: boolean
  className?: string
}

export function UpsetBadge({ upset, surpriseDraw, className = '' }: UpsetBadgeProps) {
  if (upset) {
    return (
      <span
        className={`inline-flex items-center gap-0.5 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300 ring-1 ring-red-400/40 ${className}`}
      >
        🚨 이변
      </span>
    )
  }
  if (surpriseDraw) {
    return (
      <span
        className={`inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-400/30 ${className}`}
      >
        🤝 선전
      </span>
    )
  }
  return null
}
