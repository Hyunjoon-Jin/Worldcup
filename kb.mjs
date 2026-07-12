import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await b.newPage()
await p.goto('http://localhost:4173', { waitUntil:'networkidle' })
const skip = p.getByText('건너뛰기'); if (await skip.isVisible().catch(()=>false)) await skip.click()
await p.getByRole('textbox', { name:'조추첨 시드' }).fill('KB')
await p.getByText('시드로 즉시 조추첨').click()
await p.getByText('조추첨이 완료되었습니다',{exact:false}).waitFor({timeout:8000})
await p.click('body')
await p.keyboard.press('5') // 확률 대시보드
await p.waitForTimeout(500)
const dash = await p.getByText('몬테카를로 시뮬레이션한 확률',{exact:false}).isVisible().catch(()=>false)
console.log('keyboard tab 5 -> dashboard:', dash)
await b.close()
