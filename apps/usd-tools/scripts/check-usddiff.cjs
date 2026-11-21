// Runs each usddiff sample pair in headless WebKit; saves stdout and the exit
// code per pair (web-<i>.out, web-<i>.exit) and screenshots, to compare
// with OpenUSD's usddiff on the same files.
//   BASE=http://127.0.0.1:8727 PLAYWRIGHT_CORE=<playwright-core> WEBKIT=<pw_run.sh> node scripts/check-usddiff.cjs
const { webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core')
const fs = require('fs')
const B = process.env.BASE ?? 'http://127.0.0.1:8727'
const W = Number(process.env.WIDTH ?? 1180)
;(async () => {
  const browser = await webkit.launch(process.env.WEBKIT ? { executablePath: process.env.WEBKIT } : {})
  const page = await browser.newPage({ viewport: { width: W, height: 1000 } })
  page.on('pageerror', e => console.error('PAGEERROR', e.message))
  await page.goto(`${B}/usddiff/`)
  await page.waitForSelector('select[aria-label="Sample pair"] option:nth-child(2)', { state: 'attached' })
  if (process.env.SETTINGS) {
    await page.evaluate(s => localStorage.setItem('usd-tools.usddiff.settings', s), process.env.SETTINGS)
    await page.reload()
    await page.waitForSelector('select[aria-label="Sample pair"] option:nth-child(2)', { state: 'attached' })
  }
  const tag = process.env.SHOT ?? 'diff'
  const which = (process.env.PAIRS ?? '0,1,2,3').split(',').map(Number)
  let runs = 0
  for (const i of which) {
    await page.selectOption('select[aria-label="Sample pair"]', String(i))
    if (i === which[0]) {
      await page.waitForSelector('.owl.comparing', { state: 'attached' })
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${tag}-comparing.png` })
    }
    runs++
    await page.waitForFunction(n => document.querySelectorAll('.log .run[data-exit]').length >= n, runs, { timeout: 300000 })
    await page.waitForTimeout(900)
    const r = await page.evaluate(() => {
      const run = [...document.querySelectorAll('.log .run')].at(-1)
      return { exit: run.dataset.exit, out: [...run.querySelectorAll('.out')].map(s => s.textContent).join(''),
        err: [...run.querySelectorAll('.err')].map(s => s.textContent).join(''), says: document.querySelector('.owl-says').textContent,
        summary: document.querySelector('.diff-summary').textContent }
    })
    fs.writeFileSync(`web-${i}${process.env.SUFFIX ?? ''}.out`, r.out)
    console.log(i, 'exit', r.exit, '|', r.says, '|', r.summary, r.err ? `| ERR ${r.err.slice(0, 300)}` : '')
    await page.screenshot({ path: `${tag}-${i}.png`, fullPage: true })
  }
  await browser.close()
})()
