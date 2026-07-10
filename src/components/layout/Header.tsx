import { GlassButton } from '../common/GlassButton'
import { useSandboxStore } from '../../store/useSandboxStore'

export function Header() {
  const sandboxMode = useSandboxStore((s) => s.sandboxMode)
  const toggleSandbox = useSandboxStore((s) => s.toggleSandbox)

  return (
    <header className="flex flex-col items-center gap-3 px-4 pt-8 pb-4 text-center sm:flex-row sm:justify-between sm:text-left">
      <div>
        <h1 className="bg-gradient-to-r from-emerald-300 via-sky-300 to-red-300 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:text-3xl">
          2026 북중미 월드컵 시뮬레이터
        </h1>
        <p className="mt-1 text-xs text-gray-400 sm:text-sm">
          조추첨부터 결승까지 — 실제 규정 기반 가상 시뮬레이션 (실제 대회 결과와 무관)
        </p>
      </div>
      <GlassButton
        variant={sandboxMode ? 'danger' : 'ghost'}
        onClick={toggleSandbox}
        className="shrink-0"
      >
        {sandboxMode ? '🧪 샌드박스 모드 ON' : '🧪 샌드박스 모드'}
      </GlassButton>
    </header>
  )
}
