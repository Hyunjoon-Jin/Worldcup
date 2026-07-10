import type { HTMLAttributes } from 'react'

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  strong?: boolean
}

export function GlassCard({ children, className = '', strong = false, ...rest }: GlassCardProps) {
  return (
    <div className={`${strong ? 'glass-strong' : 'glass'} rounded-2xl ${className}`} {...rest}>
      {children}
    </div>
  )
}
