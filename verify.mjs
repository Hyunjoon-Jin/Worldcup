import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await b.newPage()
const errs = []
p.on('console', m => { if (m.type()==='error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()) })
p.on('pageerror', e => errs.push('PAGEERR: '+e))
await p.goto('http://localhost:4173', { waitUntil:'networkidle' })
const skip = p.getByText('건너뛰기'); if (await skip.isVisible().catch(()=>false)) await skip.click()
await p.getByRole('textbox', { name:'조추첨 시드' }).fill('WORKER')
await p.getByText('시드로 즉시 조추첨').click()
await p.getByText('조추첨이 완료되었습니다',{exact:false}).waitFor({timeout:8000})
await p.getByRole('tab', { name:'확률 대시보드' }).click()
// wait for computing to finish (button returns to 새로고침)
await p.getByRole('button', { name:'🔄 새로고침' }).waitFor({ timeout:20000 })
await p.waitForTimeout(500)
// Check a probability value is present and > 0 somewhere in the table
const text = await p.locator('table').first().innerText().catch(()=>'')
const hasPct = /\d+\.\d+/.test(text)
// group stage pct near 100 for a top team? just check some numeric % exists in table
console.log('worker errors:', errs.length, errs.slice(0,3))
console.log('dashboard table has numeric probabilities:', hasPct)
// Also verify champion probabilities sum roughly to 100 by reading championPct column is hard; just assert table non-empty
console.log('table length:', text.length)
await b.close()
