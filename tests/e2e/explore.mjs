// 사용자 시점 탐색: 주요 플로우를 진행하며 스크린샷 + 관찰 로그를 남긴다.
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173'
const EXEC = process.env.PLAYWRIGHT_CHROMIUM
const DIR = process.env.SHOT_DIR ?? '/tmp/claude-0/-home-user-Worldcup/bd6c10e3-7802-534c-addd-a9ec30766aaa/scratchpad/shots'
import { mkdirSync } from 'fs'
mkdirSync(DIR, { recursive: true })

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {})
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

const log = (...a) => console.log(...a)
const shot = async (name) => { await page.screenshot({ path: `${DIR}/${name}.png` }).catch(() => {}) }
const txt = async (sel) => (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400)
const clickText = async (t, opts = {}) => {
  const el = page.getByText(t, opts).first()
  if (await el.count() && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); return true }
  return false
}

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
log('=== 초기 로드 ===')
log('상단바:', await txt('body'))
await shot('01-home')

// 다음 일정 진행 버튼을 여러 번 눌러 예선을 진행한다.
log('\n=== 예선 진행 (다음 일정 진행 반복) ===')
for (let i = 0; i < 6; i++) {
  const btn = page.getByRole('button', { name: /다음 일정 진행|진행하기|조추첨/ }).first()
  if (!(await btn.count()) || !(await btn.isVisible().catch(() => false))) { log(`[${i}] 진행 버튼 없음`); break }
  const label = await btn.innerText().catch(() => '')
  await btn.click().catch(() => {})
  await page.waitForTimeout(700)
  // 혹시 뜬 공개 패널/모달 닫기
  await page.keyboard.press('Escape').catch(() => {})
  log(`[${i}] 클릭="${label.replace(/\s+/g, ' ')}"`)
}
await shot('02-progress')
log('진행 후 상단:', await txt('body'))

// 내 팀 선택
log('\n=== 내 팀 탭 ===')
await clickText('내 팀', { exact: true })
await page.waitForTimeout(500)
await shot('03-myteam')
log('내 팀 화면:', await txt('#main-content ~ *, main, body'))
// 팀 선택기가 있으면 첫 팀 클릭
const pick = page.locator('button', { hasText: /대한민국|일본|브라질|아르헨티나/ }).first()
if (await pick.count()) { await pick.click().catch(() => {}); await page.waitForTimeout(400); await shot('03b-myteam-picked') }

// 캘린더 탭
log('\n=== 캘린더 ===')
await clickText('캘린더', { exact: true })
await page.waitForTimeout(500)
await shot('04-calendar')

// 친선전 탭
log('\n=== 친선전 ===')
await clickText('친선전', { exact: true })
await page.waitForTimeout(500)
await shot('05-friendlies')
log('친선전:', await txt('body'))

// 월드컵 지역예선 탭
log('\n=== 월드컵 지역예선 ===')
await clickText('월드컵 지역예선', { exact: true })
await page.waitForTimeout(500)
await shot('06-wcqual')
log('WC예선:', await txt('body'))

// 대륙컵 지역예선 탭
log('\n=== 대륙컵 지역예선 ===')
await clickText('대륙컵 지역예선', { exact: true })
await page.waitForTimeout(500)
await shot('07-cupqual')
log('대륙컵예선:', await txt('body'))

// FIFA 랭킹
log('\n=== FIFA 랭킹 ===')
await clickText('FIFA 랭킹', { exact: true })
await page.waitForTimeout(500)
await shot('08-ranking')

log('\n=== 콘솔 오류:', errors.length, '===')
for (const e of errors.slice(0, 10)) log(' •', e)

await browser.close()
