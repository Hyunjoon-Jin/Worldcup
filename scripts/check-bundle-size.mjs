// 번들 크기 예산 검사 (H2). 빌드 산출물의 개별 JS 청크가 예산을 넘으면 실패한다.
// 앱이 점점 무거워지는 것을 CI에서 사전에 잡아낸다. 사용법: npm run build 후 node scripts/check-bundle-size.mjs
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ASSETS_DIR = 'dist/assets'
// 개별 청크 예산(KB). 코드 스플리팅(B5) 이후 가장 큰 청크 기준으로 여유를 두고 설정.
const MAX_CHUNK_KB = 320

let dirEntries
try {
  dirEntries = readdirSync(ASSETS_DIR)
} catch {
  console.error(`❌ ${ASSETS_DIR} 를 찾을 수 없습니다. 먼저 npm run build 를 실행하세요.`)
  process.exit(1)
}

const jsFiles = dirEntries.filter((f) => f.endsWith('.js'))
let worst = 0
let failed = false

for (const file of jsFiles) {
  const kb = statSync(join(ASSETS_DIR, file)).size / 1024
  worst = Math.max(worst, kb)
  const flag = kb > MAX_CHUNK_KB ? '❌' : '✓'
  if (kb > MAX_CHUNK_KB) failed = true
  console.log(`${flag} ${file}  ${kb.toFixed(1)} KB`)
}

console.log(`\n최대 청크 ${worst.toFixed(1)} KB / 예산 ${MAX_CHUNK_KB} KB`)
if (failed) {
  console.error('❌ 번들 예산 초과 — 코드 스플리팅/의존성 정리를 검토하세요.')
  process.exit(1)
}
console.log('✅ 번들 예산 통과')
