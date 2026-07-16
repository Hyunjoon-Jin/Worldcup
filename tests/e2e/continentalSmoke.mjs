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

  // 기본 진입점이 시즌 홈(일정 축)이고, 진행 척추(지금 진행할 일정)가 렌더되는지
  await page.getByText('시즌 캘린더', { exact: false }).first().waitFor({ timeout: 10000 })
  assert(true, '기본 진입점이 캘린더(일정 축)이다')
  assert(await page.getByText('지금 진행할 일정', { exact: false }).first().isVisible(), '진행 척추(현재 일정)가 표시된다')
  assert(await page.getByRole('button', { name: '▶ 이 일정 진행' }).isVisible(), '현재 일정 진행 버튼이 있다')
  // 예선 명시화: 현재 일정(월드컵)의 단계 표시(지역예선 진행 중)가 렌더된다.
  assert(await page.getByText('지역예선 진행 중', { exact: false }).first().isVisible(), '현재 일정의 진행 단계가 표시된다')
  assert(await page.getByText('전체 일정', { exact: false }).first().isVisible(), '전체 일정이 표시된다')
  // 실제 달력(월별 그리드)이 캘린더 탭에 렌더된다.
  assert(await page.getByText('📅 시즌 캘린더', { exact: false }).first().isVisible(), '실제 달력(월별 그리드)이 표시된다')
  // 캘린더 상단 '다음 일정 진행' 버튼이 있다.
  assert(await page.getByRole('button', { name: /다음 일정 진행/ }).isVisible(), '캘린더 상단 다음 일정 진행 버튼이 있다')
  // 진행 중인 대회 섹션(캘린더 하단)이 렌더된다.
  assert(await page.getByText('🔴 진행 중인 대회', { exact: false }).first().isVisible(), '진행 중인 대회 섹션이 표시된다')

  // 캘린더 축: 대회를 임의로 고를 수 없다. 현재 일정(월드컵)을 자동 진행해 다음 일정(대륙컵)이 다가오게 한다.
  await page.getByRole('button', { name: '⏭ 자동 진행 후 다음 일정로' }).click()
  // 다음 일정이 대륙컵으로 다가왔다 — 현재 일정 카드에서 진행하면 대륙컵 이벤트로 진입한다.
  await page.getByRole('button', { name: '▶ 이 일정 진행' }).click()
  await page.getByRole('button', { name: '⚽ 대회 시뮬레이션' }).waitFor({ timeout: 10000 })
  assert(true, '캘린더에서 다가온 대륙컵으로 진입된다(임의 선택 불가)')
  // 대륙대회 일정 상세화: 대회 화면에 라운드별 날짜(대회 일정)가 표시된다.
  assert(await page.getByText('📅 대회 일정', { exact: false }).first().isVisible(), '대륙컵 라운드별 일정이 표시된다')
  await page.getByRole('textbox', { name: '대회 시드' }).fill('CUP-SMOKE')
  await page.getByRole('button', { name: '⚽ 대회 시뮬레이션' }).click()
  // 조추첨(stage 0)부터 단계별 공개 — 조편성 확인 후 끝까지 진행.
  await page.getByText('조추첨 완료', { exact: false }).waitFor({ timeout: 10000 })
  assert(true, '시뮬레이션 후 조추첨부터 단계별로 공개된다')
  assert((await page.getByText('CUP-SMOKE').count()) > 0, '사용한 시드가 표시된다')
  assert(await page.getByText('조별리그').first().isVisible(), '조편성(조별리그)이 렌더된다')

  // 끝까지 진행 → 우승·녹아웃 공개
  await page.getByRole('button', { name: '⏭ 끝까지 진행' }).click()
  await page.getByText('🏆 우승', { exact: false }).waitFor({ timeout: 10000 })
  assert(true, '끝까지 진행이 우승팀을 결정한다')
  assert(await page.getByText('녹아웃').first().isVisible(), '녹아웃이 렌더된다')

  // 확률 계산
  await page.getByRole('button', { name: '📊 우승 확률 계산' }).click()
  await page.getByText('우승 확률 (상위 8)', { exact: false }).waitFor({ timeout: 15000 })
  assert(true, '우승 확률이 계산·표시된다')

  // 팀 페이지에 대륙컵 현황이 월드컵과 동일 층위로 표시되는지 (우승팀 클릭)
  await page.locator('text=🏆 우승').locator('..').getByRole('button').first().click()
  // 기본(개요) 탭에 트로피 캐비닛이 표시된다.
  await page.getByText('트로피 캐비닛', { exact: false }).first().waitFor({ timeout: 10000 })
  assert(true, '팀 페이지 개요 탭에 트로피 마일스톤이 표시된다')
  // 하위 탭(일정·기록)으로 이동해 대륙컵 현황이 월드컵과 동일 층위로 표시되는지 확인.
  await page.getByRole('tab', { name: '🗓 일정·기록' }).click()
  await page.getByText('현황', { exact: false }).first().waitFor({ timeout: 10000 })
  assert(await page.getByText('조별리그 경기').first().isVisible(), '팀 페이지 일정·기록 탭에 대륙컵 현황이 표시된다')

  assert(consoleErrors.length === 0, `콘솔 오류가 없다 (발견: ${consoleErrors.length})`)
  if (consoleErrors.length) console.error(consoleErrors)

  console.log('\n✅ 대륙컵 스모크 테스트 통과')
} finally {
  await browser.close()
}
