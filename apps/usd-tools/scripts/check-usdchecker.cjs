// Has the usdchecker inspector look at samples in headless WebKit: screenshots
// mid-inspection and with the report; prints each run's exit code and output.
//   BASE=http://127.0.0.1:8727 PLAYWRIGHT_CORE=<playwright-core> WEBKIT=<pw_run.sh> \
//     node scripts/check-usdchecker.cjs /samples/heath/heath.usda /samples/cycles/cycles.usda
// writes web-<sample>.out/.err to compare with OpenUSD's usdchecker output.
const { webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core')
const fs = require('fs')
const B = process.env.BASE ?? 'http://127.0.0.1:8727'
const W = Number(process.env.WIDTH ?? 1180)
;(async () => {
  const browser = await webkit.launch(process.env.WEBKIT ? { executablePath: process.env.WEBKIT } : {})
  const page = await browser.newPage({ viewport: { width: W, height: 1000 } })
  page.on('pageerror', e => console.error('PAGEERROR', e.message))
  await page.goto(`${B}/usdchecker/`)
  await page.waitForSelector('select[aria-label=Sample] option:nth-child(3)', { state: 'attached' })
  if (process.env.SETTINGS) {
    await page.evaluate(s => localStorage.setItem('usd-tools.usdchecker.settings', s), process.env.SETTINGS)
    await page.reload()
    await page.waitForSelector('select[aria-label=Sample] option:nth-child(3)', { state: 'attached' })
  }
  const tag = process.env.SHOT ?? 'check'
  let i = 0
  for (const sample of process.argv.slice(2)) {
    i++
    await page.selectOption('select[aria-label=Sample]', sample)
    if (i === 1) {
      await page.waitForSelector('.loupe.scanning', { state: 'attached', timeout: 60000 })
      await page.waitForTimeout(700)
      await page.screenshot({ path: `${tag}-inspecting.png` })
    }
    await page.waitForFunction(n => document.querySelectorAll('.log .run[data-exit]').length >= n, i, { timeout: 300000 })
    await page.waitForTimeout(1200)
    const run = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.log .run')].at(-1)
      return {
        exit: r.dataset.exit,
        out: [...r.querySelectorAll('.out')].map(s => s.textContent).join(''),
        err: [...r.querySelectorAll('.err')].map(s => s.textContent).join(''),
        verdict: document.querySelector('.report')?.className,
        summary: document.querySelector('.report-summary')?.textContent,
      }
    })
    const name = sample.split('/')[2]
    fs.writeFileSync(`web-${name}${process.env.SUFFIX ?? ''}.out`, run.out)
    fs.writeFileSync(`web-${name}${process.env.SUFFIX ?? ''}.err`, run.err)
    console.log(name, 'exit', run.exit, '|', run.verdict, '|', run.summary)
    await page.screenshot({ path: `${tag}-${name}.png` })
  }
  await browser.close()
})()
