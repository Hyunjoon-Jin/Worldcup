/**
 * 경량 효과음·햅틱 (v2 #49). 오디오 파일 없이 Web Audio API로 짧은 톤을 합성한다.
 * 재생은 사용자 조작(버튼 클릭 등) 컨텍스트에서만 호출되므로 자동재생 정책에 걸리지 않는다.
 */
let ctx: AudioContext | null = null

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx ??= new AC()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, start: number, dur: number, gain = 0.06): void {
  const ac = audioCtx()
  if (!ac) return
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, ac.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(ac.currentTime + start)
  osc.stop(ac.currentTime + start + dur)
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
}

/** 경기 진행 등 가벼운 클릭 톤. */
export function playClick(): void {
  tone(440, 0, 0.08)
}

/** 이변 발생 알림(두 음). */
export function playUpset(): void {
  tone(660, 0, 0.1)
  tone(990, 0.09, 0.14)
  vibrate(40)
}

/** 우승 팡파레(상승 3음). */
export function playVictory(): void {
  tone(523, 0, 0.16) // C5
  tone(659, 0.15, 0.16) // E5
  tone(784, 0.3, 0.3) // G5
  vibrate([60, 40, 120])
}
