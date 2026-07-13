import { useState } from 'react'
import { useThemeStore } from '../../store/useThemeStore'
import { useA11yStore } from '../../store/useA11yStore'
import { useOnboardingStore } from '../../store/useOnboardingStore'
import { useSkinStore, SKIN_SWATCH, SKIN_LABEL, type Skin } from '../../store/useSkinStore'
import { useSoundStore } from '../../store/useSoundStore'
import { clearAllHistory } from '../../store/tournamentActions'

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
  const skin = useSkinStore((s) => s.skin)
  const setSkin = useSkinStore((s) => s.setSkin)
  const soundEnabled = useSoundStore((s) => s.enabled)
  const toggleSound = useSoundStore((s) => s.toggle)
  const reopenOnboarding = useOnboardingStore((s) => s.reopen)
  const [confirming, setConfirming] = useState(false)
  const [cleared, setCleared] = useState(false)

  return (
    <details className="group relative">
      <summary className="glass flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl text-gray-100 hover:bg-white/15" aria-label="설정 열기">
        ⚙️
      </summary>
      <div className="popover-solid absolute right-0 z-30 mt-2 w-56 rounded-xl p-3 text-left">
        <Row label="다크/라이트">
          <Toggle on={theme === 'light'} onClick={toggleTheme} label="라이트 모드" />
        </Row>
        <Row label="모션 줄이기">
          <Toggle on={reduceMotion} onClick={toggleReduceMotion} label="모션 줄이기" />
        </Row>
        <Row label="효과음·진동">
          <Toggle on={soundEnabled} onClick={toggleSound} label="효과음" />
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
        <Row label="테마 색상">
          <div className="flex gap-1.5">
            {(Object.keys(SKIN_SWATCH) as Skin[]).map((s) => (
              <button
                key={s}
                onClick={() => setSkin(s)}
                aria-label={SKIN_LABEL[s]}
                aria-pressed={skin === s}
                title={SKIN_LABEL[s]}
                className={`h-5 w-5 rounded-full ring-offset-1 transition-all ${skin === s ? 'ring-2 ring-white' : ''}`}
                style={{ background: SKIN_SWATCH[s] }}
              />
            ))}
          </div>
        </Row>
        <button
          onClick={reopenOnboarding}
          className="mt-2 w-full rounded-lg bg-white/5 py-1.5 text-[11px] text-gray-300 hover:bg-white/10"
        >
          📖 앱 소개 다시 보기
        </button>

        {/* 진행 이력 전체 삭제 (되돌릴 수 없으므로 2단계 확인) */}
        <div className="mt-2 border-t border-white/10 pt-2">
          {cleared ? (
            <p className="py-1.5 text-center text-[11px] text-emerald-300">✅ 진행 이력을 삭제했어요</p>
          ) : confirming ? (
            <div className="flex items-center gap-1.5">
              <span className="flex-1 text-[11px] leading-tight text-amber-300">예선·본선·저장 슬롯을 모두 삭제할까요?</span>
              <button
                onClick={() => {
                  clearAllHistory()
                  setConfirming(false)
                  setCleared(true)
                  setTimeout(() => setCleared(false), 2500)
                }}
                className="shrink-0 rounded bg-red-500/25 px-2 py-1 text-[11px] font-bold text-red-200 hover:bg-red-500/35"
              >
                삭제
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="shrink-0 rounded bg-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/20"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="w-full rounded-lg bg-red-500/10 py-1.5 text-[11px] text-red-300 hover:bg-red-500/20"
            >
              🗑️ 진행 이력 전체 삭제
            </button>
          )}
          <p className="mt-1 text-[10px] leading-tight text-gray-500">테마·효과음·내 팀 등 환경설정은 유지됩니다.</p>
        </div>
      </div>
    </details>
  )
}
