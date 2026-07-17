// 핵심 플로우 스모크 테스트 (F3): 조추첨 → 결승까지 진행 → 확률 대시보드 렌더.
// @playwright/test 러너 없이 playwright 크로미움으로 직접 구동한다.
// 실행: 앱 프리뷰 서버(기본 http://localhost:4173)를 띄운 뒤 `node tests/e2e/smoke.mjs`.
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
// 외부 리소스(폰트 CDN 등) 로드 실패는 앱 버그가 아니라 네트워크/프록시 환경 문제이므로 제외하고,
// 실제 JS 실행 오류만 게이트한다.
const isNetworkNoise = (text) => /Failed to load resource|ERR_|net::/.test(text)
page.on('console', (msg) => {
  if (msg.type() === 'error' && !isNetworkNoise(msg.text())) consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(String(err)))

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  assert(await page.getByText('국가대표 시뮬레이터').isVisible(), '앱이 로드된다')

  // 첫 방문 온보딩 오버레이가 있으면 건너뛴다 (v2 #48)
  const skip = page.getByText('건너뛰기')
  if (await skip.isVisible().catch(() => false)) await skip.click()

  // 일정 축: 기본 진입은 캘린더(시즌 홈). 진행 버튼이 상단 고정 바에 있는지 확인한다.
  await page.getByRole('button', { name: /다음 일정 진행/ }).first().waitFor({ timeout: 10000 })
  assert(true, '캘린더 상단에 다음 일정 진행 버튼이 표시된다')

  // 예선은 캘린더가 시작·진행한다(지역예선 탭엔 시작/시드 조작이 없다). 캘린더에서 한 번 진행해 예선을 시작한 뒤,
  // 지역예선 탭에서 '예선 끝까지 자동 진행'으로 마무리한다.
  await page.getByRole('button', { name: /다음 일정 진행/ }).first().click()
  await page.getByRole('tab', { name: '월드컵 지역예선', exact: true }).click()
  // 첫 경기일이 조추첨으로 시작하면 조추첨을 완료해 경기 진행 단계로 넘어간다(있을 때만).
  const drawDone = page.getByRole('button', { name: /조추첨 완료/ })
  if (await drawDone.isVisible().catch(() => false)) await drawDone.click()
  await page.getByRole('button', { name: '⏭ 예선 끝까지 자동 진행' }).click()
  await page.getByText('본선 진출 48개국', { exact: false }).first().waitFor({ timeout: 15000 })
  assert(true, '지역예선이 끝까지 진행되어 본선 진출국이 확정된다')

  // 조추첨 준비 → 조추첨 탭으로 이동
  await page.getByRole('button', { name: '🎲 조추첨 진행하기 →' }).click()

  // 시드로 즉시 조추첨(결정론적)
  await page.getByRole('textbox', { name: '조추첨 시드' }).fill('SMOKE-TEST')
  await page.getByText('시드로 즉시 조추첨').click()
  await page.getByText('조추첨이 완료되었습니다', { exact: false }).waitFor({ timeout: 10000 })
  assert(true, '시드 조추첨이 완료된다')
  assert((await page.getByText('SMOKE-TEST').count()) > 0, '사용한 시드가 표시된다')

  // 일정 진행 탭으로 이동 → 결승까지 자동 진행
  await page.getByRole('tab', { name: '일정 진행' }).click()
  await page.getByText('결승까지 자동 진행').click()
  await page.getByText('우승팀이 결정되었습니다', { exact: false }).waitFor({ timeout: 15000 })
  assert(true, '결승까지 자동 진행이 우승팀을 결정한다')

  // 확률 대시보드 렌더(진입 시 본선 몬테카를로 시뮬레이션 자동 실행)
  await page.getByRole('tab', { name: '확률 대시보드' }).click()
  await page.getByText('몬테카를로 시뮬레이션', { exact: false }).first().waitFor({ timeout: 15000 })
  assert(true, '확률 대시보드가 렌더된다')

  assert(consoleErrors.length === 0, `콘솔 오류가 없다 (발견: ${consoleErrors.length})`)
  if (consoleErrors.length) console.error(consoleErrors)

  console.log('\n✅ 스모크 테스트 통과')
} finally {
  await browser.close()
}
