import { GlassButton } from '../common/GlassButton'
import { SettingsMenu } from './SettingsMenu'
import { useSandboxStore } from '../../store/useSandboxStore'

export function Header() {
  const sandboxMode = useSandboxStore((s) => s.sandboxMode)
  const toggleSandbox = useSandboxStore((s) => s.toggleSandbox)

  return (
    <header className="flex flex-col items-center gap-3 px-4 pt-8 pb-4 text-center sm:flex-row sm:justify-between sm:text-left">
      <div>
        <h1 className="font-display break-keep bg-gradient-to-r from-emerald-300 via-sky-300 to-red-300 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl md:text-4xl">
          월드컵 시뮬레이터
        </h1>
        <p className="mt-1.5 text-xs tracking-wide text-gray-400 sm:text-sm">
          조추첨부터 결승까지 — 실제 규정 기반 가상 시뮬레이션 (실제 대회 결과와 무관)
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <GlassButton
          variant={sandboxMode ? 'danger' : 'ghost'}
          onClick={toggleSandbox}
          aria-pressed={sandboxMode}
        >
          {sandboxMode ? '🧪 샌드박스 모드 ON' : '🧪 샌드박스 모드'}
        </GlassButton>
        <SettingsMenu />
      </div>
    </header>
  )
}
