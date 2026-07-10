import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-3 pb-16 sm:px-6">
      {children}
    </div>
  )
}
