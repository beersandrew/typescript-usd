#!/usr/bin/env node
// Window > Python Interpreter in Safari: a real-browser check of the console
// (src/py-interpreter.ts) on the dev server, as README.md's browser checks
// run in Safari on a Mac.
//
//   node scripts/python-interpreter-check/run.mjs [--out DIR] [--scene URL]
//
// A Vite dev server for this app (vite.config.ts: the pxr Python plugin
// serves Pyodide and the pxr package) serves the viewer page with page.ts
// beside src/main.ts at /__pycheck/; the page is opened with
// `open -a Safari`, enters SESSION (page.ts) in the console and posts the
// transcript to /__pycheck/result, written to <out>/result.json and
// <out>/transcript.txt. The tab is closed afterwards (AppleScript).
import { createServer } from 'vite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const app = path.resolve(here, '../..')
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const out = path.resolve(arg('--out', path.join(here, 'out')))
const scene = arg('--scene', null)
mkdirSync(out, { recursive: true })

let finish
const done = new Promise(resolve => { finish = resolve })
const logs = []
const page = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Python Interpreter check</title>
<link rel="stylesheet" href="/src/page.css"></head><body><main id="viewer-host" aria-label="USD viewer"></main>
<script type="module" src="/src/main.ts"></script><script type="module" src="/scripts/python-interpreter-check/page.ts"></script></body></html>`
const plugin = {
  name: 'python-interpreter-check',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, 'http://x')
      if (req.method === 'GET' && url.pathname === '/__pycheck/') {
        res.setHeader('content-type', 'text/html')
        res.end(await server.transformIndexHtml(req.url, page)); return
      }
      if (req.method === 'POST' && url.pathname.startsWith('/__pycheck/')) {
        const chunks = []
        for await (const c of req) chunks.push(c)
        const body = Buffer.concat(chunks).toString('utf8')
        res.end('ok')
        if (url.pathname === '/__pycheck/log') { logs.push(JSON.parse(body)); console.log('page:', JSON.parse(body)) }
        else if (url.pathname === '/__pycheck/result') finish(JSON.parse(body))
        return
      }
      next()
    })
  },
}
const server = await createServer({ configFile: path.join(app, 'vite.config.ts'), root: app, logLevel: 'warn', clearScreen: false, server: { host: '127.0.0.1', port: 0, open: false }, plugins: [plugin] })
await server.listen()
const port = server.httpServer.address().port
const target = `http://127.0.0.1:${port}/__pycheck/${scene ? `?scene=${encodeURIComponent(scene)}` : ''}`
console.log(`== Safari: ${target}`)
execFileSync('open', ['-a', 'Safari', target])
const timeout = setTimeout(() => finish({ fatal: 'timeout: no result in 300 s' }), 300_000)
const result = await done
clearTimeout(timeout)
result.logs = logs
writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 1))
if (result.transcript) writeFileSync(path.join(out, 'transcript.txt'), result.transcript)
try {
  execFileSync('osascript', ['-e', `tell application "Safari" to close (every tab of every window whose URL contains "127.0.0.1:${port}/__pycheck")`])
} catch (error) { console.log(`could not close the Safari tab: ${error.message}`) }
await server.close()
console.log(`== result: ${path.join(out, 'result.json')}`)
process.exit(result.fatal || result.loadError ? 1 : 0)
