// Opens a sample on the usdresolve page in headless WebKit, sends every
// letter of the root layer (and any extra addresses), and writes one JSON
// line per send: argv, stdout, stderr, exit. Screenshots the first flight
// and the end. Compare each line's command with OpenUSD's usdresolve.
//   BASE=http://127.0.0.1:8727 PLAYWRIGHT_CORE=<playwright-core> WEBKIT=<pw_run.sh> \
//     EXTRA='nope.usda' node scripts/check-usdresolve.cjs /samples/formats/formats.usda
const { webkit } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core')
const fs = require('fs')
const B = process.env.BASE ?? 'http://127.0.0.1:8727'
const W = Number(process.env.WIDTH ?? 1180)
;(async () => {
  const browser = await webkit.launch(process.env.WEBKIT ? { executablePath: process.env.WEBKIT } : {})
  const page = await browser.newPage({ viewport: { width: W, height: 1000 } })
  page.on('pageerror', e => console.error('PAGEERROR', e.message))
  await page.goto(`${B}/usdresolve/`)
  await page.waitForSelector('select[aria-label=Sample] option:nth-child(3)', { state: 'attached' })
  if (process.env.SETTINGS) {
    await page.evaluate(s => localStorage.setItem('usd-tools.usdresolve.settings', s), process.env.SETTINGS)
    await page.reload()
    await page.waitForSelector('select[aria-label=Sample] option:nth-child(3)', { state: 'attached' })
  }
  const tag = process.env.SHOT ?? 'resolve'
  const sample = process.argv[2]
  await page.selectOption('select[aria-label=Sample]', sample)
  await page.waitForSelector('.letter, .letters .hint:not(:empty)', { timeout: 60000 })
  await page.waitForFunction(() => !/Reading/.test(document.querySelector('.letters').textContent), null, { timeout: 60000 })
  const count = await page.$$eval('.letter', l => l.length)
  const out = []
  const record = async n => {
    await page.waitForFunction(k => document.querySelectorAll('.log .run[data-exit]').length >= k, n, { timeout: 120000 })
    await page.waitForFunction(() => !document.querySelector('.pigeon.flying'), null, { timeout: 20000 })
    return page.evaluate(() => {
      const r = [...document.querySelectorAll('.log .run')].at(-1)
      return { cmd: r.querySelector('.cmd').textContent.trim(), exit: r.dataset.exit,
        out: [...r.querySelectorAll('.out')].map(s => s.textContent).join(''), err: [...r.querySelectorAll('.err')].map(s => s.textContent).join(''),
        result: document.querySelector('.result').textContent }
    })
  }
  let n = 0
  for (let i = 0; i < count; i++) {
    const letters = await page.$$('.letter')
    await letters[i].click()
    if (i === Number(process.env.SHOTAT ?? 0)) { await page.waitForTimeout(Number(process.env.SHOTMS ?? 500)); await page.screenshot({ path: `${tag}-flying.png` }) }
    out.push(await record(++n))
  }
  for (const extra of (process.env.EXTRA ?? '').split(',').filter(Boolean)) {
    await page.fill('.write input', extra)
    await page.click('.send')
    out.push(await record(++n))
  }
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${tag}-end.png` })
  fs.writeFileSync(`${tag}.jsonl`, out.map(o => JSON.stringify(o)).join('\n') + '\n')
  for (const o of out) console.log(o.exit, o.cmd, '=>', (o.out || o.err).trim())
  await browser.close()
})()
