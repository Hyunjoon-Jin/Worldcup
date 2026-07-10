import * as Flags from 'country-flag-icons/react/3x2'
import type { ComponentType, SVGProps } from 'react'

interface FlagIconProps {
  iso2: string
  className?: string
}

export function FlagIcon({ iso2, className = '' }: FlagIconProps) {
  const Flag = (Flags as Record<string, ComponentType<SVGProps<SVGSVGElement>>>)[iso2]
  if (!Flag) return null
  return (
    <span className={`inline-block overflow-hidden rounded-[3px] shadow-sm ring-1 ring-white/20 ${className}`}>
      <Flag className="block h-full w-full object-cover" />
    </span>
  )
}
