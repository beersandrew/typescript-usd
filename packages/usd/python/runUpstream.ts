// Runs upstream OpenUSD Python test files, unchanged, under Pyodide (CPython
// on WebAssembly) with `from pxr import ...` resolving to the forwarding
// layer in python/pxr over typescript-usd.
//
// As upstream's ctest harness does (cmake/macros/Public.cmake,
// pxr_register_test with TESTENV), the test's testenv/<name>/ directory, if
// any, is copied into a fresh temporary directory that becomes the working
// directory; the .py file itself is read straight from the OpenUSD checkout.
//
// Calls into the core that return a Promise (e.g. UsdStage.open, whose
// asset reads go through Ar asynchronously) are awaited synchronously from
// Python with pyodide.ffi.run_sync, which needs JavaScript Promise
// Integration: Node must run with --experimental-wasm-jspi
// (python/vitest.config.ts passes it).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { tsusd } from './bridge.ts'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
// Pyodide finds its .wasm and stdlib beside pyodide.mjs; under vite the
// module URL is rewritten, so name the directory explicitly.
const pyodideDir = path.dirname(createRequire(import.meta.url).resolve('pyodide/package.json'))

export const OPENUSD_SRC = process.env.OPENUSD_SRC ?? path.join(os.homedir(), 'git/OpenUSD-26.11.1')

export interface UpstreamTestResult {
  file: string
  testsRun: number
  passed: string[]
  failures: { test: string, traceback: string }[]
  errors: { test: string, traceback: string }[]
  skipped: { test: string, reason: string }[]
  output: string
  wasSuccessful: boolean
}

export interface PxrPython {
  pyodide: PyodideInterface
  loadMs: number
  run(relPath: string): Promise<UpstreamTestResult>
}

// Mount a host directory at the same absolute path inside Pyodide's file
// system, so Python and typescript-usd (which reads through Node's fs) see
// the same paths.
export function mountSame(py: PyodideInterface, dir: string): void {
  py.FS.mkdirTree(dir)
  py.FS.mount(py.FS.filesystems.NODEFS, { root: dir }, dir)
}

const RUNNER = `
import sys, io, unittest, types, os, traceback
def _run_upstream(src_path, workdir):
    os.chdir(workdir)
    with open(src_path, encoding='utf-8') as f:
        source = f.read()
    name = os.path.splitext(os.path.basename(src_path))[0]
    module = types.ModuleType(name)
    module.__file__ = src_path
    sys.modules[name] = module
    out = io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = out
    try:
        exec(compile(source, src_path, 'exec'), module.__dict__)
        suite = unittest.defaultTestLoader.loadTestsFromModule(module)
        ran = []
        def walk(s):
            for t in s:
                if isinstance(t, unittest.TestSuite): walk(t)
                else: ran.append(t.id())
        walk(suite)
        result = unittest.TextTestRunner(stream=out, verbosity=2).run(suite)
    finally:
        sys.stdout, sys.stderr = old_out, old_err
        del sys.modules[name]
    bad = set(t.id() for t, _ in result.failures + result.errors)
    bad |= set(t.id() for t, _ in result.skipped)
    return {
        'testsRun': result.testsRun,
        'passed': [t for t in ran if t not in bad],
        'failures': [{'test': t.id(), 'traceback': tb} for t, tb in result.failures],
        'errors': [{'test': t.id(), 'traceback': tb} for t, tb in result.errors],
        'skipped': [{'test': t.id(), 'reason': r} for t, r in result.skipped],
        'output': out.getvalue(),
        'wasSuccessful': result.wasSuccessful(),
    }
`

export async function loadPxrPython(): Promise<PxrPython> {
  const t0 = performance.now()
  const pyodide = await loadPyodide({ indexURL: pyodideDir + path.sep })
  const loadMs = performance.now() - t0
  mountSame(pyodide, path.join(here))
  mountSame(pyodide, OPENUSD_SRC)
  pyodide.registerJsModule('_tsusd', { ...tsusd, openusdSrc: OPENUSD_SRC })
  // Never write bytecode caches into the OpenUSD checkout.
  pyodide.runPython(`import sys; sys.dont_write_bytecode = True; sys.path.insert(0, ${JSON.stringify(here)})`)
  pyodide.runPython(RUNNER)
  const runner = pyodide.globals.get('_run_upstream')

  return {
    pyodide,
    loadMs,
    async run(relPath: string): Promise<UpstreamTestResult> {
      const src = path.join(OPENUSD_SRC, relPath)
      const name = path.basename(relPath, '.py')
      const workdir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
      const dataDir = path.join(path.dirname(src), name)
      if (fs.existsSync(dataDir)) fs.cpSync(dataDir, workdir, { recursive: true })
      mountSame(pyodide, workdir)
      const cwd = process.cwd()
      process.chdir(workdir)
      try {
        const result = await runner.callPromising(src, workdir)
        const js = result.toJs({ dict_converter: Object.fromEntries })
        result.destroy()
        return { file: relPath, ...js } as UpstreamTestResult
      } finally {
        process.chdir(cwd)
        pyodide.FS.unmount(workdir)
        fs.rmSync(workdir, { recursive: true, force: true })
      }
    },
  }
}
