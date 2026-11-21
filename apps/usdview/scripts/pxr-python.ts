import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin } from 'vite'
import { patchPyodideAsm } from './pyodide-number-patch'

/**
 * Dev-server support for Window > Python Interpreter (src/py-interpreter.ts)
 * and the Python example runner (src/python-runner.ts):
 * the pxr forwarding layer of packages/usd/python, run under Pyodide in the
 * page. The dev server serves them from the repository; a build ships them
 * inside its output, so a static file server is enough:
 *
 * - the build's `virtual:pxr-python` carries the same Python files, keyed by
 *   fixed paths in Pyodide's file system (/pxr-python/ for python/,
 *   /openusd/ for the OpenUSD checkout) instead of this machine's paths;
 * - Pyodide's runtime files are copied to pxr-pyodide/ next to index.html,
 *   pyodide.asm.mjs with the Safari number-conversion workaround of
 *   pyodide-number-patch.ts (also applied when the dev server serves it).
 *
 * The example runner's inputs (/pxr-examples/) and captures stay dev-only.
 *
 * - `virtual:pxr-python` exports the files the pxr package reads, as text
 *   keyed by absolute path (python/pxr/**, the example scripts, and every
 *   .py file of upstream's library directories that the forwarding layer
 *   covers, read from the OpenUSD checkout), and re-exports the library's
 *   page loader (packages/usd/python/browser.ts).
 * - `/pxr-pyodide/` serves Pyodide's runtime files from the library's
 *   pyodide dependency.
 * - `/pxr-examples/` serves the example inputs: the committed fixtures,
 *   and the directory named by PXR_EXAMPLE_INPUTS when set (local inputs
 *   that are not committed).
 * - `POST /pxr-capture/<name>.png` saves a viewport capture into the
 *   directory named by PXR_CAPTURE_DIR, when set (local review images,
 *   never committed).
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const pythonDir = path.resolve(here, '../../../packages/usd/python')
const openusdSrc = process.env.OPENUSD_SRC ?? path.join(os.homedir(), 'git/OpenUSD-26.11.1')
const pyodideDir = path.resolve(pythonDir, '../node_modules/pyodide')
/** Pyodide's runtime: what loadPyodide fetches from its indexURL. */
const PYODIDE_FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json', 'package.json']
/** Where the build puts python/ and the OpenUSD checkout in Pyodide's file system. */
const BUILD_PYTHON_DIR = '/pxr-python', BUILD_OPENUSD_SRC = '/openusd'
const VIRTUAL = 'virtual:pxr-python'
const RESOLVED = '\0' + VIRTUAL

function pyFiles(dir: string, out: Record<string, string>, recurse: boolean): void {
  if (!fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (recurse && e.name !== '__pycache__' && e.name !== 'fixtures') pyFiles(p, out, recurse)
    } else if (e.name.endsWith('.py')) out[p] = fs.readFileSync(p, 'utf8')
  }
}

function collectFiles(): Record<string, string> {
  const files: Record<string, string> = {}
  pyFiles(path.join(pythonDir, 'pxr'), files, true)
  pyFiles(path.join(pythonDir, 'examples'), files, false)
  // Each forwarded library's upstream Python files (its __init__.py and
  // submodules), as python/pxr/__init__.py's finder reads them.
  for (const lib of fs.readdirSync(path.join(pythonDir, 'pxr'), { withFileTypes: true })) {
    if (!lib.isDirectory()) continue
    const name = lib.name[0]!.toLowerCase() + lib.name.slice(1)
    for (const area of ['base', 'usd', 'imaging', 'usdImaging', 'exec']) {
      pyFiles(path.join(openusdSrc, 'pxr', area, name), files, false)
    }
  }
  return files
}

const types: Record<string, string> = {
  '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.zip': 'application/zip',
}

function serveDir(prefix: string, dirs: () => string[]): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (!req.url?.startsWith(prefix)) return next()
    const rel = decodeURIComponent(req.url.slice(prefix.length).split('?')[0]!)
    for (const dir of dirs()) {
      const file = path.resolve(dir, rel)
      if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) continue
      res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream')
      // Pyodide's runtime with the Safari number-conversion workaround
      // (pyodide-number-patch.ts), as the build ships it.
      res.end(path.basename(file) === 'pyodide.asm.mjs' && dir === pyodideDir ? patchPyodideAsm(fs.readFileSync(file, 'utf8')) : fs.readFileSync(file))
      return
    }
    res.statusCode = 404
    res.end('not found')
  }
}

export function pxrPython(): Plugin {
  let command: 'serve' | 'build' = 'serve'
  return {
    name: 'usdview-pxr-python',
    configResolved(config) { command = config.command },
    resolveId(id) { return id === VIRTUAL ? RESOLVED : undefined },
    load(id) {
      if (id !== RESOLVED) return undefined
      const browser = path.join(pythonDir, 'browser.ts')
      if (command === 'build') {
        // The same files under fixed paths, so the build does not carry this
        // machine's directory names.
        const files: Record<string, string> = {}
        for (const [file, text] of Object.entries(collectFiles())) {
          const rel = (dir: string) => path.relative(dir, file).split(path.sep).join('/')
          if (file.startsWith(pythonDir + path.sep)) files[`${BUILD_PYTHON_DIR}/${rel(pythonDir)}`] = text
          else if (file.startsWith(openusdSrc + path.sep)) files[`${BUILD_OPENUSD_SRC}/${rel(openusdSrc)}`] = text
        }
        if (!Object.keys(files).some(f => f.startsWith(BUILD_OPENUSD_SRC + '/'))) {
          this.error(`No upstream Python files found under ${openusdSrc} (set OPENUSD_SRC to an OpenUSD 26.11.1 checkout).`)
        }
        return [
          `export { loadPxrPythonInBrowser, jspiSupported, createPxrInteractive } from ${JSON.stringify(browser)}`,
          `export const files = ${JSON.stringify(files)}`,
          `export const pythonDir = ${JSON.stringify(BUILD_PYTHON_DIR)}`,
          `export const openusdSrc = ${JSON.stringify(BUILD_OPENUSD_SRC)}`,
          `export const examplesDir = ${JSON.stringify(`${BUILD_PYTHON_DIR}/examples`)}`,
        ].join('\n')
      }
      return [
        `export { loadPxrPythonInBrowser, jspiSupported, createPxrInteractive } from ${JSON.stringify(browser)}`,
        `export const files = ${JSON.stringify(collectFiles())}`,
        `export const pythonDir = ${JSON.stringify(pythonDir)}`,
        `export const openusdSrc = ${JSON.stringify(openusdSrc)}`,
        `export const examplesDir = ${JSON.stringify(path.join(pythonDir, 'examples'))}`,
      ].join('\n')
    },
    generateBundle() {
      for (const name of PYODIDE_FILES) {
        const file = path.join(pyodideDir, name)
        const source = name === 'pyodide.asm.mjs' ? patchPyodideAsm(fs.readFileSync(file, 'utf8')) : fs.readFileSync(file)
        this.emitFile({ type: 'asset', fileName: `pxr-pyodide/${name}`, source })
      }
    },
    configureServer(server) {
      server.middlewares.use(serveDir('/pxr-pyodide/', () => [pyodideDir]))
      server.middlewares.use((req, res, next) => {
        const dir = process.env.PXR_CAPTURE_DIR
        if (req.method !== 'POST' || !req.url?.startsWith('/pxr-capture/') || !dir) return next()
        const name = path.basename(decodeURIComponent(req.url.slice('/pxr-capture/'.length)))
        if (!/^[\w.-]+\.png$/.test(name)) { res.statusCode = 400; res.end('bad name'); return }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks))
          res.end('ok')
        })
      })
      server.middlewares.use(serveDir('/pxr-examples/', () => [
        path.join(pythonDir, 'examples/fixtures'),
        ...process.env.PXR_EXAMPLE_INPUTS ? [path.resolve(process.env.PXR_EXAMPLE_INPUTS)] : [],
      ]))
    },
  }
}
