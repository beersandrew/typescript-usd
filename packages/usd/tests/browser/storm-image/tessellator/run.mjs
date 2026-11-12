// Safari run of HgiWebGPU's tessellator kernels against the TypeScript port
// (main.ts). Browser test: run by hand, not part of vitest.
//
//   node tests/browser/storm-image/tessellator/run.mjs --out <dir> [--port 8812]
//       [--browser safari|chrome]  (default safari; chrome: tests/browser/browser.mjs)
import { browserLabel, browserOption, closeBrowser, openPage } from '../../browser.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt }
const browser = browserOption(args)
const out = path.resolve(opt('out', 'tessellator-out'))
const port = Number(opt('port', '8812'))
mkdirSync(out, { recursive: true })
const here = path.dirname(new URL(import.meta.url).pathname)
let resolveDone
const done = new Promise(r => { resolveDone = r })
const body = req => new Promise(resolve => { let s = ''; req.on('data', c => { s += c }); req.on('end', () => resolve(s)) })
const server = await createServer({
  root: path.resolve(here, '..'),
  configFile: false,
  logLevel: 'warn',
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [path.resolve(here, '../../../../../..')] } },
  plugins: [{
    name: 'tessellator-sink',
    configureServer(s) {
      s.middlewares.use(async (req, res, next) => {
        if (req.method === 'POST' && req.url === '/__result') {
          const posted = JSON.parse(await body(req))
          writeFileSync(path.join(out, 'results.json'), JSON.stringify(posted, null, 2))
          for (const r of posted.results) console.log(`${r.mismatches.length ? 'FAIL' : 'pass'} ${r.config.padEnd(36)} ${r.patches} patches, ${r.attempts} run(s)${r.mismatches.length ? `: ${r.mismatches[0]}` : ''}`)
          if (posted.errors.length) console.log(`WebGPU errors: ${posted.errors.join(' | ')}`)
          res.end('ok'); resolveDone(); return
        }
        next()
      })
    },
  }],
})
try {
  await server.listen()
  const url = `http://127.0.0.1:${port}/tessellator/index.html`
  console.log(`opening ${url} in ${browserLabel(browser)}`)
  await openPage(browser, url, { out })
  await done
} finally {
  await closeBrowser()
  await server.close()
}
