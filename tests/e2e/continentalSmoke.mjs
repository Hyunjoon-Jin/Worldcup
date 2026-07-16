// 대륙컵 플로우 스모크 테스트: 대륙컵 탭 → 대회 선택 → 시뮬레이션 → 우승 표시 → 확률 계산.
// 실행: 프리뷰 서버(기본 http://localhost:4173)를 띄운 뒤 `node tests/e2e/continentalSmoke.mjs`.
import { chromium } from 'playwright'

const BASE_URL = process.env.SMOKE_URL ?? 'http://localhost:4173'
const EXEC_PATH = process.env.PLAYWRIGHT_CHROMIUM ?? undefined

function assert(condition, message) {
  if (!condition) throw new Error(`❌ ${message}`)
  console.log(`✓ ${message}`)
}

const browser = await chromium.launch(EXEC_PATH ? { executablePath: EXEC_PATH } : {})
const page = await browser.newPage()
const consoleErrors = []
const isNetworkNoise = (text) => /Failed to load resource|ERR_|net::/.test(text)
page.on('console', (msg) => {
  if (msg.type() === 'error' && !isNetworkNoise(msg.text())) consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(String(err)))

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  const skip = page.getByText('건너뛰기')
  if (await skip.isVisible().catch(() => false)) await skip.click()

  // 대륙컵 탭으로 이동 (지연 로딩 → Suspense 해제 대기)
  await page.getByRole('tab', { name: '대륙컵' }).click()
  await page.getByText('대륙별 대표 대회').first().waitFor({ timeout: 10000 })
  assert(true, '대륙컵 탭이 렌더된다')

  // 유로 선택 → 시뮬레이션
  await page.getByText('유럽 축구 선수권').first().click()
  await page.getByRole('textbox', { name: '대회 시드' }).fill('CUP-SMOKE')
  await page.getByRole('button', { name: '⚽ 대회 시뮬레이션' }).click()
  await page.getByText('🏆 우승', { exact: false }).waitFor({ timeout: 10000 })
  assert(true, '대회 시뮬레이션이 우승팀을 결정한다')
  assert((await page.getByText('CUP-SMOKE').count()) > 0, '사용한 시드가 표시된다')

  // 조별리그·녹아웃 렌더 확인
  assert(await page.getByText('조별리그').first().isVisible(), '조별리그가 렌더된다')
  assert(await page.getByText('녹아웃').first().isVisible(), '녹아웃이 렌더된다')

  // 확률 계산
  await page.getByRole('button', { name: '📊 우승 확률 계산' }).click()
  await page.getByText('우승 확률 (상위 8)', { exact: false }).waitFor({ timeout: 15000 })
  assert(true, '우승 확률이 계산·표시된다')

  assert(consoleErrors.length === 0, `콘솔 오류가 없다 (발견: ${consoleErrors.length})`)
  if (consoleErrors.length) console.error(consoleErrors)

  console.log('\n✅ 대륙컵 스모크 테스트 통과')
} finally {
  await browser.close()
}
