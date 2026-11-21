// Sews each sample set on the usdstitch or usdstitchclips page in headless
// WebKit, saves every result file to got/<set>/, and screenshots.
//   BASE=http://127.0.0.1:8727 PLAYWRIGHT_CORE=<playwright-core> WEBKIT=<pw_run.sh> \
//     node scripts/check-usdstitch.cjs usdstitch 0,1,2   (or usdstitchclips 0)
// then compare got/ with OpenUSD's usdstitch / usdstitchclips on the same files.
const { webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core')
const fs = require('fs'), path = require('path')
const B = process.env.BASE ?? 'http://127.0.0.1:8727'
const W = Number(process.env.WIDTH ?? 1180)
;(async () => {
  const [tool, which = '0'] = process.argv.slice(2)
  const browser = await webkit.launch(process.env.WEBKIT ? { executablePath: process.env.WEBKIT } : {})
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: W, height: 1000 } })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.error('PAGEERROR', e.message))
  await page.goto(`${B}/${tool}/`)
  if (process.env.SETTINGS) {
    await page.evaluate(([k, s]) => localStorage.setItem(k, s), [`usd-tools.${tool}.settings`, process.env.SETTINGS])
    await page.reload()
  }
  await page.waitForSelector('select[aria-label="Sample set"] option:nth-child(2)', { state: 'attached' })
  const tag = process.env.SHOT ?? tool
  let runs = 0
  for (const i of which.split(',')) {
    await page.selectOption('select[aria-label="Sample set"]', i)
    if (runs === 0) {
      await page.waitForSelector('.mouse.sewing', { state: 'attached' })
      await page.waitForTimeout(250)
      await page.screenshot({ path: `${tag}-sewing.png` })
    }
    runs++
    await page.waitForFunction(n => document.querySelectorAll('.log .run[data-exit]').length >= n, runs, { timeout: 300000 })
    await page.waitForTimeout(1200)
    const run = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.log .run')].at(-1)
      return { cmd: r.querySelector('.cmd').textContent.trim(), exit: r.dataset.exit, text: r.textContent, note: document.querySelector('.note').textContent }
    })
    console.log(i, 'exit', run.exit, '|', run.note)
    if (run.text.split('\n').length > 2) console.log(run.text.slice(0, 600))
    const dir = path.join('got', `${tool}-${i}`)
    fs.mkdirSync(dir, { recursive: true })
    for (const t of await page.$$('.result-tag')) {
      const [dl] = await Promise.all([page.waitForEvent('download'), t.click()])
      await dl.saveAs(path.join(dir, dl.suggestedFilename()))
    }
    await page.screenshot({ path: `${tag}-${i}.png`, fullPage: true })
  }
  await browser.close()
})()
