// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStMeshTopology.cpp,
//  pxr/imaging/hdSt/testenv/testHdStQuadrangulation.cpp,
//  pxr/imaging/hdSt/testenv/testHdStSubdivision.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to JavaScript and modified. See LICENSE and NOTICE.

// Safari run of the hdSt upstream tests whose computations need a GPU:
// testHdStMeshTopology's GPU normals, testHdStQuadrangulation's GPU
// quadrangulation (every case of both files runs) and testHdStSubdivision's
// GPU subdivision, on HgiWebGPU. The vitest runs of the same tests use the
// recording test Hgi, which has no compute pipelines (see the test files).
// testHdStSubdivision's output is compared, per call, with the registered
// test's stdout baseline (tests/fixtures/testHdStSubdivision/). Writes
// results.json, prints one line per test, stops the server.
// Browser test: run by hand, not part of vitest.
//
//   node tests/browser/storm-image/hdst-gpu/run.mjs --out <dir> [--port 8815] [--filter <substring>]
//       [--browser safari|chrome]  (default safari; chrome: tests/browser/browser.mjs)
import { browserLabel, browserOption, closeBrowser, openPage } from '../../browser.mjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt }
const browser = browserOption(args)
const out = path.resolve(opt('out', 'hdst-gpu-out'))
const port = Number(opt('port', '8815'))
const filter = opt('filter', '')
mkdirSync(out, { recursive: true })
const here = path.dirname(new URL(import.meta.url).pathname)
const repo = path.resolve(here, '../../../..')
const baseline = readFileSync(path.join(repo,
  'pxr/imaging/hdSt/tests/fixtures/testHdStSubdivision/testHdStSubdivisionOsd3-Run1-stdout.txt'), 'utf8')
const baselineLines = baseline.split('\n')
// subdivision.test.ts: where each call's output is in the baseline.
const expectedSegments = []
baselineLines.forEach((line, i) => {
  if (line.startsWith('Test ')) expectedSegments.push(baselineLines.slice(i, i + 8))
  if (line === 'PrimitiveIDMap Test') expectedSegments.push(baselineLines.slice(i + 1, i + 5))
})

const tests = []
let subdivision = null
let resolveDone
const done = new Promise(r => { resolveDone = r })
const body = req => new Promise(resolve => { let s = ''; req.on('data', c => { s += c }); req.on('end', () => resolve(s)) })
const server = await createServer({
  root: path.resolve(here, '..'),
  configFile: false,
  logLevel: 'warn',
  resolve: { alias: { vitest: path.join(here, 'vitestShim.ts') } },
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [path.resolve(here, '../../../../../..')] } },
  plugins: [{
    name: 'hdst-gpu-sink',
    configureServer(s) {
      s.middlewares.use(async (req, res, next) => {
        if (req.method === 'POST' && req.url === '/__test') {
          const r = JSON.parse(await body(req))
          tests.push(r)
          console.log(`${r.pass ? 'pass' : 'FAIL'} ${r.name}${r.error ? ` -- ${r.error.split('\n')[0].slice(0, 200)}` : ''}${r.gpuErrors?.length ? ` (${r.gpuErrors.length} WebGPU errors)` : ''}`)
          res.end('ok'); return
        }
        if (req.method === 'POST' && req.url === '/__subdivision') {
          subdivision = JSON.parse(await body(req))
          res.end('ok'); return
        }
        if (req.method === 'POST' && req.url === '/__done') { res.end('ok'); resolveDone(); return }
        next()
      })
    },
  }],
})
try {
  await server.listen()
  const url = `http://127.0.0.1:${port}/hdst-gpu/index.html${filter ? `?filter=${encodeURIComponent(filter)}` : ''}`
  console.log(`opening ${url} in ${browserLabel(browser)}`)
  await openPage(browser, url, { out })
  await done
  const subdivisionCalls = []
  if (subdivision?.calls) {
    subdivision.calls.forEach((c, i) => {
      const expected = expectedSegments[i]
      const linesMatch = JSON.stringify(c.lines) === JSON.stringify(expected)
      const pass = linesMatch && !c.exception && c.counterFailures.length === 0
      subdivisionCalls.push({ label: c.label, gpu: c.gpu, pass, lines: c.lines, expected, counterFailures: c.counterFailures, exception: c.exception })
      console.log(`${pass ? 'pass' : 'FAIL'} testHdStSubdivision > ${c.label}${linesMatch ? '' : ' (output differs from baseline)'}${c.counterFailures.length ? ` (${c.counterFailures.join('; ')})` : ''}${c.exception ? ` -- ${c.exception.split('\n')[0]}` : ''}`)
    })
    console.log(`testHdStSubdivision error mark clean: ${subdivision.errorMarkClean}`)
  } else if (subdivision) {
    console.log(`testHdStSubdivision exception: ${subdivision.exception}`)
  }
  const summary = {
    userAgent: subdivision?.userAgent,
    tests: { passed: tests.filter(t => t.pass).length, failed: tests.filter(t => !t.pass).length, results: tests },
    testHdStSubdivision: subdivision && {
      passed: subdivisionCalls.filter(c => c.pass).length, failed: subdivisionCalls.filter(c => !c.pass).length,
      errorMarkClean: subdivision.errorMarkClean, diagnostics: subdivision.diagnostics, gpuErrors: subdivision.gpuErrors,
      output: subdivision.output, calls: subdivisionCalls,
    },
  }
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(summary, null, 2))
  console.log(`tests: ${summary.tests.passed} pass, ${summary.tests.failed} fail; testHdStSubdivision calls: ${summary.testHdStSubdivision?.passed} pass, ${summary.testHdStSubdivision?.failed} fail; ${path.join(out, 'results.json')}`)
} finally {
  await closeBrowser()
  await server.close()
}
