// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to JavaScript and modified. See LICENSE and NOTICE.

// Safari WGSL check for the GLSL-to-WGSL translator (packages/usd/docs/
// imaging-i1.md, "Decisions": Safari's WebGPU compiler is the WGSL
// validator). Builds the modules (modules.ts), serves them with a result sink
// on 127.0.0.1, opens the page in Safari (`open -a Safari`, the only browser
// automation allowed), waits for the results, writes them and stops the
// server.
//
//   node tests/browser/wgsl-check/run.mjs --openusd <OpenUSD 26.11.1 checkout> \
//     --native depthBias=<dir> --native basic_lv0_hull=<dir> --out <dir> [--port 8795]
//   node tests/browser/wgsl-check/run.mjs --codegen-only --out <dir>
//
// --codegen-only compiles just testHdStDepthBias's programs as the TypeScript
// code generator builds them under HgiWebGPU's capabilities
// (codegenModules.ts); without it they are compiled after the corpus.
//
// <dir> for --native holds a reference-build run with
// TF_DEBUG="HDST_DUMP_SHADER_SOURCE HDST_DUMP_SHADER_SOURCEFILE" (stdout.txt
// plus the generated programN_shaderM_<STAGE>.glsl files).
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt }
const openusd = opt('openusd', process.env.OPENUSD_SOURCE ?? new URL('../../../../../../OpenUSD-26.11.1', import.meta.url).pathname)
const out = opt('out', path.resolve('wgsl-check-out'))
const port = Number(opt('port', '8795'))
const native = {}
args.forEach((a, i) => { if (a === '--native') { const [k, v] = args[i + 1].split('='); native[k] = v } })
mkdirSync(out, { recursive: true })

const here = path.dirname(new URL(import.meta.url).pathname)
let modulesJson = ''
let resolveDone
const done = new Promise(r => { resolveDone = r })
const server = await createServer({
  root: here,
  configFile: false,
  logLevel: 'warn',
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [path.resolve(here, '../../..')] } },
  plugins: [{
    name: 'wgsl-check-sink',
    configureServer(s) {
      s.middlewares.use((req, res, next) => {
        if (req.url === '/__modules.json') { res.setHeader('Content-Type', 'application/json'); res.end(modulesJson); return }
        if (req.method === 'POST' && req.url === '/__result') {
          let body = ''
          req.on('data', c => { body += c })
          req.on('end', () => { res.end('ok'); resolveDone(body) })
          return
        }
        next()
      })
    },
  }],
})
try {
  const { buildCodegenModules, DEPTH_BIAS_CODEGEN_PIPELINES } = await server.ssrLoadModule(path.join(here, 'codegenModules.ts'))
  const codegenOnly = args.includes('--codegen-only')
  let modules = buildCodegenModules()
  let pipelines = [...DEPTH_BIAS_CODEGEN_PIPELINES]
  if (!codegenOnly) {
    const { buildModules, DEPTH_BIAS_PIPELINES } = await server.ssrLoadModule(path.join(here, 'modules.ts'))
    modules = [...buildModules(openusd, native), ...modules]
    pipelines = [...(native.depthBias ? DEPTH_BIAS_PIPELINES : []), ...pipelines]
  }
  modulesJson = JSON.stringify({ modules, pipelines })
  writeFileSync(path.join(out, 'modules.json'), modulesJson)
  await server.listen()
  const url = `http://127.0.0.1:${port}/index.html`
  console.log(`${modules.length} modules; opening ${url} in Safari`)
  execFileSync('open', ['-a', 'Safari', url])
  const body = await done
  writeFileSync(path.join(out, 'results.json'), body)
  const r = JSON.parse(body)
  console.log(`${r.userAgent}\ncompiled ${r.results.filter(x => x.compiled).length} of ${r.results.filter(x => x.compiled !== null).length} translated modules in ${r.ms} ms; results in ${out}`)
  for (const p of r.pipelines) console.log(`pipeline ${p.name}: ${p.error ?? 'ok'}`)
  for (const x of r.results.filter(x => x.id.startsWith('depthBiasCodegen/'))) {
    const errors = (x.messages ?? []).filter(m => m.type === 'error')
    console.log(`${x.id}: ${x.compiled === null ? 'not translated' : x.compiled ? 'compiled' : 'FAILED'}`)
    for (const m of errors) console.log(`  ${m.line}:${m.col}: ${m.text}`)
    if (x.scopeError) console.log(`  ${x.scopeError}`)
  }
} finally {
  await server.close()
}
