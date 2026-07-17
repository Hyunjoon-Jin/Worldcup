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

  // 기본 진입점이 캘린더(일정 축)이고, 상단 고정 진행 바가 렌더되는지
  await page.getByText('시즌 캘린더', { exact: false }).first().waitFor({ timeout: 10000 })
  assert(true, '기본 진입점이 캘린더(일정 축)이다')
  // 진행 버튼(시간대별/경기일 단위 선택 + 다음 일정 진행)이 상단 고정 바에 있다.
  assert(await page.getByRole('button', { name: /다음 일정 진행/ }).first().isVisible(), '상단 고정 바에 다음 일정 진행 버튼이 있다')
  assert(await page.getByRole('button', { name: '경기일 단위' }).isVisible(), '진행 단위(경기일 단위) 선택 버튼이 있다')
  // 예선 명시화: 현재 일정(월드컵)의 단계 표시(진입 시 '지역예선 시작 전' → 진행하면 '진행 중')가 렌더된다.
  assert(await page.getByText('지역예선', { exact: false }).first().isVisible(), '현재 일정의 진행 단계가 표시된다')
  assert(await page.getByText('전체 일정', { exact: false }).first().isVisible(), '전체 일정이 표시된다')
  // 실제 달력(월별 그리드)이 캘린더에 렌더된다.
  assert(await page.getByText('📅 시즌 캘린더', { exact: false }).first().isVisible(), '실제 달력(월별 그리드)이 표시된다')
  // 진행 중인 대회 섹션(캘린더 하단)이 렌더된다.
  assert(await page.getByText('🔴 진행 중인 대회', { exact: false }).first().isVisible(), '진행 중인 대회 섹션이 표시된다')

  // 캘린더 축: 대회를 임의로 고를 수 없다. '전체 일정'에서 월드컵을 클릭해 자동 진행하면 다음 일정(대륙컵)이 다가온다.
  const scheduleCard = page.getByText('전체 일정', { exact: false }).locator('..')
  await scheduleCard.getByRole('button', { name: /FIFA 월드컵/ }).first().click()
  // 자동 진행이 끝나면 월드컵 결승 모달이 뜬다(그 경기를 보고 넘어가는 흐름) — 모달의 ✕(닫기)로 닫는다.
  const modal = page.locator('div.fixed.inset-0.z-50')
  await modal.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  if (await modal.first().isVisible().catch(() => false)) {
    await modal.getByRole('button', { name: '닫기' }).click()
    await modal.first().waitFor({ state: 'hidden', timeout: 5000 })
  }
  // 다음 일정이 대륙컵으로 다가왔다 — 상단 '다음 일정 진행'으로 한 단계 진입(조추첨)하면 대회가 시작된다.
  await page.getByRole('button', { name: /다음 일정 진행/ }).first().click()
  // 진행 중인 대회 섹션의 대륙컵 '실황 보기' 링크로 대회 페이지에 진입한다.
  await page.getByRole('button', { name: /실황 보기/ }).first().click({ timeout: 10000 })
  await page.getByText('📅 대회 일정', { exact: false }).first().waitFor({ timeout: 10000 })
  assert(true, '캘린더에서 다가온 대륙컵 실황 페이지로 진입된다(임의 선택 불가)')
  // 대륙대회 일정 상세화: 대회 화면에 라운드별 날짜(조별리그 1차전 등)가 표시된다.
  assert(await page.getByText('조별리그').first().isVisible(), '대륙컵 라운드별 일정(조별리그)이 표시된다')

  // 대회 페이지에서 시드로 시뮬레이션 → 조추첨부터 단계별 공개.
  await page.getByRole('textbox', { name: '대회 시드' }).fill('CUP-SMOKE')
  await page.getByRole('button', { name: '⚽ 대회 시뮬레이션' }).click()
  await page.getByText('조추첨 완료', { exact: false }).waitFor({ timeout: 10000 })
  assert(true, '시뮬레이션 후 조추첨부터 단계별로 공개된다')
  assert((await page.getByText('CUP-SMOKE').count()) > 0, '사용한 시드가 표시된다')

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
