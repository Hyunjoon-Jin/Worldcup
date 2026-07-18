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
  // 다음 일정이 대륙컵으로 다가왔다 — 상단 버튼이 '조추첨 진행하기'로 바뀌고, 클릭 시 대륙컵 조추첨 탭으로 이동한다.
  // 조추첨 탭은 월드컵처럼 팀을 하나씩 뽑는 연출로 진입한다(전체 공개로 조편성 확정).
  await page.getByRole('button', { name: /조추첨 진행하기/ }).first().click()
  await page.getByRole('button', { name: /다음 국가 뽑기|전체 공개/ }).first().waitFor({ timeout: 10000 })
  assert(true, "'조추첨 진행하기'로 대륙컵 조추첨 연출(하위탭)에 진입한다")
  await page.getByRole('button', { name: '⏭ 전체 공개' }).click()
  // 월드컵 DrawStage와 동형: 전체 공개 시 조추첨 완료 안내 + '일정 진행으로 이동' 버튼이 표시된다.
  await page.getByText('조추첨이 완료되었습니다', { exact: false }).first().waitFor({ timeout: 10000 })
  assert(await page.getByRole('button', { name: /일정 진행으로 이동/ }).isVisible(), '전체 공개 시 조편성 확정 + 일정 진행으로 이동 버튼(월드컵과 동일)')

  // 일정 진행 하위탭 → 결승까지 자동 진행 → 우승 확정(월드컵 ScheduleStage와 동형)
  await page.getByRole('tab', { name: '일정 진행', exact: true }).click()
  await page.getByRole('button', { name: '⏭ 결승까지 자동 진행' }).click()
  await page.getByText('🎉 우승팀이 결정되었습니다', { exact: false }).waitFor({ timeout: 10000 })
  assert(true, '결승까지 자동 진행이 우승팀을 결정한다')
  // 월드컵과 동일하게 결과 피드·대회 통계·결과 공유가 표시된다.
  assert(await page.getByText('📊 대회 통계', { exact: false }).first().isVisible(), '일정 진행 뷰에 대회 통계가 표시된다(월드컵과 동일)')
  assert(await page.getByRole('button', { name: /결과 공유/ }).isVisible(), '우승 카드에 결과 공유 버튼이 있다(월드컵과 동일)')

  // 토너먼트 하위탭 → 녹아웃 대진 표시
  await page.getByRole('tab', { name: '토너먼트', exact: true }).click()
  assert(await page.getByText('녹아웃').first().isVisible(), '토너먼트 하위탭에 녹아웃이 렌더된다')

  // 조별리그 하위탭 → 월드컵 조별리그 뷰와 동일(규정 도움말·GROUP 카드·조 상세)
  await page.getByRole('tab', { name: '조별리그', exact: true }).click()
  assert(await page.getByText('📖 대회 규정 도움말', { exact: false }).first().isVisible(), '조별리그 뷰에 대회 규정 도움말이 표시된다(월드컵과 동일)')
  assert(await page.getByText('GROUP', { exact: false }).first().isVisible(), '조별리그 뷰에 GROUP 조 카드가 표시된다(월드컵과 동일)')
  await page.getByText('자세히 보기', { exact: false }).first().click()
  await page.getByText('경기 일정 및 결과', { exact: false }).first().waitFor({ timeout: 10000 })
  assert(true, '조 카드 클릭 시 조 상세(경기 일정 및 결과)로 이동한다(월드컵과 동일)')
  await page.getByRole('button', { name: /전체 조 보기/ }).click()

  // 확률 하위탭 진입 시 자동 계산(월드컵 확률 대시보드와 동일 — 별도 헤더 버튼 없음)
  await page.getByRole('tab', { name: '확률 대시보드', exact: true }).click()
  // 월드컵 확률 대시보드와 동형: 조별통과~우승 막대 + 몬테카를로 회수 + 새로고침.
  await page.getByText('몬테카를로 시뮬레이션', { exact: false }).waitFor({ timeout: 15000 })
  assert(await page.getByRole('button', { name: '🔄 새로고침' }).isVisible(), '진출 체인 확률 대시보드가 계산·표시된다')

  // 팀 페이지에 대륙컵 현황이 월드컵과 동일 층위로 표시되는지 (일정 진행 탭의 우승팀 클릭)
  await page.getByRole('tab', { name: '일정 진행', exact: true }).click()
  await page.getByRole('button', { name: /결과 공유/ }).waitFor({ timeout: 10000 })
  await page.locator('button.text-3xl').first().click()
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
