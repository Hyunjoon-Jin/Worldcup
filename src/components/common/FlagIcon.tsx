import * as Flags from 'country-flag-icons/react/3x2'
import type { ComponentType, SVGProps } from 'react'

interface FlagIconProps {
  iso2: string
  className?: string
}

export function FlagIcon({ iso2, className = '' }: FlagIconProps) {
  const code = (iso2 ?? '').toUpperCase()
  const Flag = (Flags as Record<string, ComponentType<SVGProps<SVGSVGElement>>>)[code]
  // 국기 미보유 소국 대체 (C5): null 대신 코드 이니셜 칩으로 정렬·존재감을 유지한다.
  if (!Flag) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-[3px] bg-white/10 text-[7px] font-bold leading-none tracking-tight text-gray-300 ring-1 ring-white/20 ${className}`}
        title={code || '국기 없음'}
        aria-hidden
      >
        {code ? code.slice(0, 2) : '🏳'}
      </span>
    )
  }
  return (
    <span className={`inline-block overflow-hidden rounded-[3px] shadow-sm ring-1 ring-white/20 ${className}`}>
      <Flag className="block h-full w-full object-cover" />
    </span>
  )
}
