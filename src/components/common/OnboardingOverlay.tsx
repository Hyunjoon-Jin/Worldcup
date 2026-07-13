import { useState } from 'react'
import { GlassCard } from './GlassCard'
import { GlassButton } from './GlassButton'
import { useOnboardingStore } from '../../store/useOnboardingStore'

interface Step {
  icon: string
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    icon: '🎱',
    title: '조추첨으로 시작',
    body: '한 팀씩 뽑거나, 시드를 입력해 즉시 조추첨할 수 있어요. "🗓 오늘의 도전"은 매일 전 세계가 같은 조로 시작합니다.',
  },
  {
    icon: '📅',
    title: '일정을 진행',
    body: '하루/한 타임씩 또는 "결승까지 자동 진행"으로 경기를 돌려보세요. 경기를 누르면 상세 예상·득점 타임라인이 나옵니다.',
  },
  {
    icon: '📊',
    title: '확률로 확인',
    body: '남은 경기를 수천 번 시뮬레이션한 진출·우승 확률을 실시간으로 보여줘요. 정밀도는 빠름/표준/정밀로 조절합니다.',
  },
  {
    icon: '🧪',
    title: '샌드박스로 실험',
    body: '팀 능력치를 직접 조정해 결과가 어떻게 바뀌는지 실험할 수 있어요. ⭐로 내 팀을 지정하면 어디서든 강조됩니다.',
  },
]

/** 첫 방문자 온보딩 오버레이 (v2 #48). */
export function OnboardingOverlay() {
  const seen = useOnboardingStore((s) => s.seen)
  const dismiss = useOnboardingStore((s) => s.dismiss)
  const [step, setStep] = useState(0)

  if (seen) return null

  const isLast = step === STEPS.length - 1
  const current = STEPS[step]

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <GlassCard strong className="w-full max-w-sm p-6 text-center">
        <div className="mb-3 text-4xl">{current.icon}</div>
        <h2 className="mb-2 text-lg font-bold text-white">{current.title}</h2>
        <p className="mb-5 text-sm leading-relaxed text-gray-300">{current.body}</p>

        <div className="mb-4 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-emerald-400' : 'w-1.5 bg-white/20'}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button onClick={dismiss} className="text-xs text-gray-500 hover:text-white">
            건너뛰기
          </button>
          <GlassButton onClick={() => (isLast ? dismiss() : setStep(step + 1))}>
            {isLast ? '시작하기' : '다음'}
          </GlassButton>
        </div>
      </GlassCard>
    </div>
  )
}
