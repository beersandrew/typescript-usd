#!/usr/bin/env node
// The static build in Safari: serves dist/ (pnpm build) as plain files, with
// no Vite and no dev-server routes, opens it with `open -a Safari`, and runs
// page.ts in the page (added beside the build's own entry), which checks the
// welcome examples and both interpreter windows (and both editing one scene,
// with stage view images) and posts its report to <out>/result.json. The tab is closed afterwards (AppleScript).
//
//   node scripts/static-build-check/run.mjs [--dist DIR] [--out DIR] [--keep]
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformWithEsbuild } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const dist = path.resolve(arg('--dist', path.join(here, '../../dist')))
const out = path.resolve(arg('--out', path.join(here, 'out')))
mkdirSync(out, { recursive: true })
// page.ts imports types only, so a transform is enough.
const pageJs = (await transformWithEsbuild(readFileSync(path.join(here, 'page.ts'), 'utf8'), 'page.ts', { target: 'es2022' })).code
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.zip': 'application/zip', '.txt': 'text/plain', '.md': 'text/plain' }

let finish
const done = new Promise(resolve => { finish = resolve })
const logs = []
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'POST' && url.pathname.startsWith('/__check/')) {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    res.end('ok')
    if (url.pathname === '/__check/log') { logs.push(body); console.log('page:', body) }
    else if (url.pathname.startsWith('/__check/image/')) {
      const name = path.basename(url.pathname)
      if (/^[\w.-]+$/.test(name)) writeFileSync(path.join(out, `${name}.png`), Buffer.from(String(body).split(',')[1] ?? '', 'base64'))
    }
    else finish(body)
    return
  }
  if (url.pathname === '/__check/page.js') { res.setHeader('content-type', 'text/javascript'); res.end(pageJs); return }
  let file = path.join(dist, decodeURIComponent(url.pathname))
  if (!file.startsWith(dist)) { res.statusCode = 403; res.end(); return }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!existsSync(file)) { res.statusCode = 404; res.end('not found'); return }
  let body = readFileSync(file)
  if (url.pathname === '/' && url.searchParams.has('check')) body = Buffer.from(String(body).replace('</body>', '<script type="module" src="/__check/page.js"></script></body>'))
  res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream')
  res.end(body)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const target = `http://127.0.0.1:${port}/?check=1`
console.log(`== Safari: ${target}`)
execFileSync('open', ['-a', 'Safari', target])
const timeout = setTimeout(() => finish({ fatal: 'timeout: no result in 300 s' }), 300_000)
const result = await done
clearTimeout(timeout)
result.logs = logs
writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 1))
if (!process.argv.includes('--keep')) {
  try {
    execFileSync('osascript', ['-e', `tell application "Safari" to close (every tab of every window whose URL contains "127.0.0.1:${port}")`])
  } catch (error) { console.log(`could not close the Safari tab: ${error.message}`) }
}
server.close()
console.log(`== result: ${path.join(out, 'result.json')}`)
process.exit(result.fatal || result.pythonError || result.typescriptError || result.editError ? 1 : 0)
