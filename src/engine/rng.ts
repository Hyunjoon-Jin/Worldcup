/**
 * 시드 기반 결정론적 난수 생성기 (C6).
 *
 * 같은 시드는 항상 같은 난수열을 만든다 → 흥미로운 조추첨 결과를 시드로 저장·공유·재현할 수 있다.
 * 문자열 시드를 32비트 정수로 해시(xmur3)한 뒤 mulberry32로 [0,1) 난수를 생성한다.
 */

export type RandomFn = () => number

/** 문자열을 결정론적 32비트 시드 정수로 변환한다. */
function xmur3(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

/** 32비트 정수 시드로부터 [0,1) 난수를 생성하는 mulberry32 PRNG. */
function mulberry32(seed: number): RandomFn {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 문자열 시드로 결정론적 난수 함수를 만든다. */
export function createSeededRandom(seed: string): RandomFn {
  return mulberry32(xmur3(seed))
}

/** 공유·표시에 적합한 짧고 읽기 쉬운 무작위 시드 문자열을 생성한다(예: "K3P-92FA"). */
export function generateSeed(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)]
  const block = (n: number) =>
    Array.from({ length: n }, pick).join('')
  return `${block(3)}-${block(4)}`
}

/** 주어진 난수 함수로 배열을 Fisher-Yates 셔플한다(원본 불변). */
export function shuffleWith<T>(arr: T[], rand: RandomFn): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
