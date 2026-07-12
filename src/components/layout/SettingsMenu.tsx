import { useThemeStore } from '../../store/useThemeStore'
import { useA11yStore } from '../../store/useA11yStore'
import { useOnboardingStore } from '../../store/useOnboardingStore'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-gray-300">{label}</span>
      {children}
    </div>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`h-5 w-9 rounded-full p-0.5 transition-colors ${on ? 'bg-emerald-500/70' : 'bg-white/15'}`}
    >
      <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`} />
    </button>
  )
}

/** 설정 팝오버 (v2 #39). 테마·모션·글자 크기·온보딩을 한곳에서. details로 접근성 확보. */
export function SettingsMenu() {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const reduceMotion = useA11yStore((s) => s.reduceMotion)
  const toggleReduceMotion = useA11yStore((s) => s.toggleReduceMotion)
  const fontScale = useA11yStore((s) => s.fontScale)
  const setFontScale = useA11yStore((s) => s.setFontScale)
  const reopenOnboarding = useOnboardingStore((s) => s.reopen)

  return (
    <details className="group relative">
      <summary className="glass flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl text-gray-100 hover:bg-white/15" aria-label="설정 열기">
        ⚙️
      </summary>
      <div className="glass-strong absolute right-0 z-30 mt-2 w-56 rounded-xl p-3 text-left">
        <Row label="다크/라이트">
          <Toggle on={theme === 'light'} onClick={toggleTheme} label="라이트 모드" />
        </Row>
        <Row label="모션 줄이기">
          <Toggle on={reduceMotion} onClick={toggleReduceMotion} label="모션 줄이기" />
        </Row>
        <Row label="글자 크기">
          <div className="flex rounded-lg bg-white/10 p-0.5">
            {(['normal', 'large'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFontScale(s)}
                aria-pressed={fontScale === s}
                className={`rounded-md px-2 py-0.5 text-[11px] ${fontScale === s ? 'bg-emerald-500/30 text-emerald-200' : 'text-gray-400'}`}
              >
                {s === 'normal' ? '보통' : '크게'}
              </button>
            ))}
          </div>
        </Row>
        <button
          onClick={reopenOnboarding}
          className="mt-2 w-full rounded-lg bg-white/5 py-1.5 text-[11px] text-gray-300 hover:bg-white/10"
        >
          📖 앱 소개 다시 보기
        </button>
      </div>
    </details>
  )
}
