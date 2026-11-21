// The pxr Python package over typescript-usd in a web page: Pyodide with
// `from pxr import ...` resolving to the forwarding layer (python/pxr) over
// the page's typescript-usd, and a runner for scripts.
//
// What runUpstream.ts gets from Node's file system (NODEFS mounts of
// python/ and the OpenUSD checkout), the page is handed as text: `files`
// maps each absolute path the package reads (python/pxr/**, upstream's
// <OpenUSD>/pxr/<area>/<lib>/*.py and the scripts to run) to its contents,
// and they are written into Pyodide's in-memory file system at those paths.
//
// PLATFORM-DIVERGENCE(pxr-py-browser-fs): a page has no host file system,
// so typescript-usd's layer IO and Python's os/open do not share files
// here. Python sees Pyodide's in-memory file system; typescript-usd reads
// assets through the page's Ar resolver (URLs). Scripts run here open their
// inputs by URL and keep their results in memory.
//
// Calls into the core that return a Promise are awaited from Python with
// pyodide.ffi.run_sync, which needs JavaScript Promise Integration
// (WebAssembly.Suspending); `jspiSupported()` reports whether the page has it.
import type { PyodideInterface } from 'pyodide'
import { tsusd } from './bridge.ts'
import { SCRIPT_RUNNER } from './scriptRunner.ts'

export { createPxrInteractive, type PxrInteractive, type InteractiveStyle } from './interactive.ts'

export interface BrowserPxrOptions {
  /** pyodide.mjs's loadPyodide, imported by the page. */
  loadPyodide: (options: { indexURL: string }) => Promise<PyodideInterface>
  /** The directory URL Pyodide's .wasm and stdlib are served from. */
  indexURL: string
  /** Absolute path -> contents of every Python file the package reads. */
  files: Readonly<Record<string, string>>
  /** The absolute path of python/ (the directory holding pxr/). */
  pythonDir: string
  /** The absolute path of the OpenUSD checkout the upstream files are under. */
  openusdSrc: string
}

export interface BrowserScriptResult {
  exitCode: number
  output: string
  /** The script's main() return value, as a Python object (a PyProxy). */
  outputs: unknown
}

export interface BrowserPxrPython {
  pyodide: PyodideInterface
  loadMs: number
  run(script: string, argv?: readonly string[]): Promise<BrowserScriptResult>
}

export function jspiSupported(): boolean {
  return typeof (WebAssembly as unknown as { Suspending?: unknown }).Suspending === 'function'
}

export async function loadPxrPythonInBrowser(options: BrowserPxrOptions): Promise<BrowserPxrPython> {
  const t0 = performance.now()
  const pyodide = await options.loadPyodide({ indexURL: options.indexURL })
  const loadMs = performance.now() - t0
  for (const [file, text] of Object.entries(options.files)) {
    pyodide.FS.mkdirTree(file.slice(0, file.lastIndexOf('/')))
    pyodide.FS.writeFile(file, text)
  }
  pyodide.registerJsModule('_tsusd', { ...tsusd, openusdSrc: options.openusdSrc })
  pyodide.runPython(`import sys; sys.dont_write_bytecode = True; sys.path.insert(0, ${JSON.stringify(options.pythonDir)})`)
  pyodide.runPython(SCRIPT_RUNNER)
  const runner = pyodide.globals.get('_run_script')
  return {
    pyodide,
    loadMs,
    async run(script, argv = []) {
      const r = await runner.callPromising(script, pyodide.toPy([...argv]), '/home/pyodide')
      const exitCode = r.get('exitCode') as number
      const output = r.get('output') as string
      const outputs = r.get('outputs')
      r.destroy()
      return { exitCode, output, outputs }
    },
  }
}
