// Drops files (or picks a sample) on the usdcat converter in headless WebKit,
// waits for the cat to deliver them, and saves each converted file to $GOT
// (default ./got), for checking with OpenUSD's own usdcat.
//
//   BASE=http://127.0.0.1:8727 PLAYWRIGHT_CORE=<playwright-core> WEBKIT=<pw_run.sh> \
//     node scripts/check-usdcat-converter.cjs a.usda b.usdc     # or /samples/heath/heath.usda
// SETTINGS='{"flatten":"stage"}' sets the gear's settings first.
const { webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core')
const path = require('path')
const B = process.env.BASE ?? 'http://127.0.0.1:8727'
;(async () => {
  const browser = await webkit.launch(process.env.WEBKIT ? { executablePath: process.env.WEBKIT } : {})
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1100, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.error('PAGEERROR', e.message))
  await page.goto(`${B}/usdcat/`)
  await page.waitForSelector('select option:nth-child(3)', { state: 'attached' })
  if (process.env.SETTINGS) {
    await page.evaluate(s => { localStorage.setItem('usd-tools.usdcat.settings', s) }, process.env.SETTINGS)
    await page.reload()
    await page.waitForSelector('select option:nth-child(3)', { state: 'attached' })
  }
  const files = process.argv.slice(2)
  if (files[0].startsWith('/samples/')) await page.selectOption('select[aria-label=Sample]', files[0])
  else await page.setInputFiles('#picker', files)
  let shot = false
  for (;;) {
    const n = await page.$$eval('.outbox .chip', cs => cs.length)
    if (!shot && await page.$('.cat-back .chip')) {
      await page.waitForTimeout(300)
      await page.screenshot({ path: process.env.SHOT ? `${process.env.SHOT}-carrying.png` : 'carrying.png' })
      shot = true
    }
    if (n === files.length) break
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(Number(process.env.SETTLE || 1500))
  await page.screenshot({ path: process.env.SHOT ? `${process.env.SHOT}-done.png` : 'done.png' })
  for (const chip of await page.$$('.outbox .chip[role=button]')) {
    const [dl] = await Promise.all([page.waitForEvent('download'), chip.click()])
    await dl.saveAs(path.join(process.env.GOT || 'got', dl.suggestedFilename()))
    console.log('saved', dl.suggestedFilename())
  }
  console.log('failed:', await page.$$eval('.outbox .chip.failed', cs => cs.map(c => c.textContent)))
  console.log(await page.$eval('.log', l => l.textContent.slice(0, 900)))
  await browser.close()
})()
