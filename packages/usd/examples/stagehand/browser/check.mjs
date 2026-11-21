#!/usr/bin/env node
// Serves a built Today folder (index.html redirect + viewer/ + the Stagehand
// plugin) as plain files, opens it in Safari with exec imaging on, runs
// check-page.js in the viewer, saves frame0/24/48.png to OUT, then closes the
// Safari tab and stops the server. Pattern: apps/usdview/scripts/static-build-check.
//   node check.mjs ROOT OUT
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const [root, out] = process.argv.slice(2).map(p => path.resolve(p))
mkdirSync(out, { recursive: true })
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.usda': 'text/plain', '.wasm': 'application/wasm', '.css': 'text/css' }
let finish
const done = new Promise(r => { finish = r })
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'POST' && url.pathname.startsWith('/__check/')) {
    const chunks = []; for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); res.end('ok')
    if (url.pathname === '/__check/log') console.log('page:', body)
    else if (url.pathname.startsWith('/__check/image/')) writeFileSync(path.join(out, `${path.basename(url.pathname)}.png`), Buffer.from(String(body).split(',')[1] ?? '', 'base64'))
    else finish(body)
    return
  }
  if (url.pathname === '/__check/page.js') { res.setHeader('content-type', 'text/javascript'); res.end(readFileSync(path.join(here, 'check-page.js'))); return }
  let file = path.join(root, decodeURIComponent(url.pathname))
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!existsSync(file)) { res.statusCode = 404; res.end(); return }
  let body = readFileSync(file)
  if (url.pathname === '/viewer/index.html' && url.searchParams.has('check')) body = Buffer.from(String(body).replace('</body>', '<script type="module" src="/__check/page.js"></script></body>'))
  res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream'); res.end(body)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const q = 'plugin=plugins/stagehand/plugInfo.json&scene=plugins/stagehand/heath.usda&env=USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX%3D1&check=1'
execFileSync('open', ['-a', 'Safari', `http://127.0.0.1:${port}/viewer/index.html?${q}`])
const result = await Promise.race([done, new Promise(r => setTimeout(() => r({ fatal: 'timeout' }), 180000))])
console.log('result:', JSON.stringify(result))
try { execFileSync('osascript', ['-e', `tell application "Safari" to close (every tab of every window whose URL contains "127.0.0.1:${port}")`], { timeout: 30000 }) }
catch (error) { console.log(`could not close the Safari tab: ${error.message}`) }
server.close()
process.exit(result.fatal ? 1 : 0)
