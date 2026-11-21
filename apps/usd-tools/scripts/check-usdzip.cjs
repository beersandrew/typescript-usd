// Packs a sample (or picked files) on the usdzip page in headless WebKit,
// screenshots the flight and the closed case, and saves the .usdz to ./got.
//   BASE=http://127.0.0.1:8727 PLAYWRIGHT_CORE=<playwright-core> WEBKIT=<pw_run.sh> \
//     node scripts/check-usdzip.cjs /samples/heath/heath.usda
// then compare got/<name>.usdz with OpenUSD's `usdzip --asset` (unzip -Z1, diff -r).
const { webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core')
const path = require('path')
const B = process.env.BASE ?? 'http://127.0.0.1:8727'
const W = Number(process.env.WIDTH ?? 1100)
;(async () => {
  const browser = await webkit.launch(process.env.WEBKIT ? { executablePath: process.env.WEBKIT } : {})
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: W, height: 980 } })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.error('PAGEERROR', e.message))
  page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE', m.text()) })
  await page.goto(`${B}/usdzip/`)
  await page.waitForSelector('select[aria-label=Sample] option:nth-child(3)', { state: 'attached' })
  const tag = process.env.SHOT ?? 'zip'
  const arg = process.argv[2]
  if (arg.startsWith('/samples/')) await page.selectOption('select[aria-label=Sample]', arg)
  else await page.setInputFiles(process.env.FOLDER ? '#folder-picker' : '#picker', process.argv.slice(2))
  await page.waitForSelector('.paper', { state: 'attached' })
  await page.waitForTimeout(Number(process.env.MID ?? 1600))
  await page.screenshot({ path: `${tag}-flying.png` })
  const result = await Promise.race([
    page.waitForSelector('.case-tag:not([hidden])', { timeout: 120000 }).then(() => 'ok'),
    page.waitForFunction(() => /could not|no USD/.test(document.querySelector('.desk-note').textContent), null, { timeout: 120000 }).then(() => 'fail'),
  ])
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${tag}-done.png` })
  console.log(result, '|', await page.$eval('.desk-note', n => n.textContent))
  console.log(await page.$eval('.log', l => l.textContent.slice(0, 1500)))
  if (result === 'ok') {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.case-tag')])
    await dl.saveAs(path.join(process.env.GOT ?? 'got', dl.suggestedFilename()))
    console.log('saved', dl.suggestedFilename())
  }
  await browser.close()
})()
