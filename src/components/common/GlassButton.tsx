import type { ButtonHTMLAttributes } from 'react'

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
}

const VARIANT_CLASSES: Record<string, string> = {
  primary:
    'bg-gradient-to-b from-emerald-400/90 to-emerald-600/90 text-white shadow-lg shadow-emerald-900/30 hover:from-emerald-300 hover:to-emerald-500 border border-emerald-300/30',
  ghost: 'glass text-gray-100 hover:bg-white/15',
  danger: 'bg-red-500/80 text-white hover:bg-red-500 border border-red-300/30',
}

export function GlassButton({ variant = 'primary', className = '', disabled, ...props }: GlassButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  )
}
