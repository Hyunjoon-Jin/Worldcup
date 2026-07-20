import { chromium } from 'playwright'
const DIR='/tmp/claude-0/-home-user-Worldcup/bd6c10e3-7802-534c-addd-a9ec30766aaa/scratchpad'
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM })
const p = await b.newPage({ viewport:{width:1280,height:900} })
await p.goto('http://localhost:4173',{waitUntil:'networkidle'})
const skip=p.getByText('건너뛰기'); if(await skip.isVisible().catch(()=>false)) await skip.click()
await p.waitForTimeout(300)
// pick my team
await p.getByRole('tab',{name:'내 팀'}).click(); await p.waitForTimeout(300)
await p.getByRole('button',{name:/대한민국/}).first().click(); await p.waitForTimeout(400)
await p.screenshot({path:`${DIR}/chip-myteam.png`})
// go to calendar to confirm chip persists
await p.getByRole('tab',{name:'캘린더'}).click(); await p.waitForTimeout(300)
await p.screenshot({path:`${DIR}/chip-calendar.png`})
console.log('done')
await b.close()
