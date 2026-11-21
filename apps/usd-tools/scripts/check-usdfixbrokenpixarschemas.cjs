// Runs each usdfixbrokenpixarschemas sample in headless WebKit; prints the
// outcome, saves each fixed file to got/<i>/, and screenshots; compare with
// OpenUSD's usdfixbrokenpixarschemas run on copies of the same samples.
//   BASE=http://127.0.0.1:8727 PLAYWRIGHT_CORE=<playwright-core> WEBKIT=<pw_run.sh> node scripts/check-usdfixbrokenpixarschemas.cjs 0,1,2
const { webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core')
const fs = require('fs'), path = require('path')
const B = process.env.BASE ?? 'http://127.0.0.1:8727'
const W = Number(process.env.WIDTH ?? 1180)
;(async () => {
  const which = (process.argv[2] ?? '0,1,2,3,4').split(',')
  const browser = await webkit.launch(process.env.WEBKIT ? { executablePath: process.env.WEBKIT } : {})
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: W, height: 1000 } })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.error('PAGEERROR', e.message))
  await page.goto(`${B}/usdfixbrokenpixarschemas/`)
  await page.waitForSelector('select[aria-label=Sample] option:nth-child(3)', { state: 'attached' })
  const tag = process.env.SHOT ?? 'fix'
  let runs = 0
  for (const i of which) {
    await page.selectOption('select[aria-label=Sample]', i)
    if (runs === 0) { await page.waitForSelector('.robot.tinkering', { state: 'attached' }); await page.waitForTimeout(400); await page.screenshot({ path: `${tag}-tinkering.png` }) }
    await page.waitForFunction(() => document.querySelector('.robot-says') && !document.querySelector('.robot-says').hidden && !document.querySelector('.robot.tinkering'), null, { timeout: 300000 })
    await page.waitForTimeout(900)
    runs++
    const r = await page.evaluate(() => ({
      says: document.querySelector('.robot-says').textContent,
      summary: document.querySelector('.diff-summary').textContent,
      fixRun: [...document.querySelectorAll('.log .run')].filter(x => /usdfixbrokenpixarschemas/.test(x.querySelector('.cmd').textContent)).at(-1)?.textContent,
    }))
    console.log(i, '|', r.says, '|', r.summary)
    console.log(r.fixRun.slice(0, 700))
    const dir = path.join('got', i)
    fs.mkdirSync(dir, { recursive: true })
    for (const t of await page.$$('.result-tag')) {
      const [dl] = await Promise.all([page.waitForEvent('download'), t.click()])
      await dl.saveAs(path.join(dir, dl.suggestedFilename()))
    }
    await page.screenshot({ path: `${tag}-${i}.png`, fullPage: true })
    // Hide the old outcome so the next wait sees the new one.
    await page.evaluate(() => { document.querySelector('.robot-says').hidden = true })
  }
  await browser.close()
})()
