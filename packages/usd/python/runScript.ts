// Runs a Python script, unchanged, under Pyodide with `from pxr import ...`
// resolving to the forwarding layer over typescript-usd: the analog of
// `python3 <script> <args...>` against a native OpenUSD build.
//
//   node --experimental-wasm-jspi <vite-node> python/runScriptCli.ts -- [--cwd DIR] [--mount DIR]... SCRIPT [ARGS...]
// (vite-node is the TypeScript runner vitest ships with).
//
// Files: Python's os/open and typescript-usd's layer IO (Node's fs) must see
// the same files, so each directory the script touches (its own directory,
// the working directory and every --mount) is mounted with NODEFS at the
// same absolute path inside Pyodide's file system, and Node's working
// directory follows Python's.
import path from 'node:path'
import { loadPxrPython, mountSame, type PxrPython } from './runUpstream.ts'
import { SCRIPT_RUNNER } from './scriptRunner.ts'

export interface ScriptRun {
  script: string
  argv?: string[]
  cwd?: string | undefined
  mounts?: string[]
}

export interface ScriptResult {
  exitCode: number
  output: string
  // The script's main() return value or module globals named `outputs`, as JS.
  outputs: unknown
}

export async function runPythonScript(pxr: PxrPython, run: ScriptRun): Promise<ScriptResult> {
  const py = pxr.pyodide
  const script = path.resolve(run.script)
  const cwd = path.resolve(run.cwd ?? process.cwd())
  for (const dir of new Set([path.dirname(script), cwd, ...(run.mounts ?? []).map(d => path.resolve(d))])) {
    // A directory already visible (itself or an ancestor mounted) is not
    // mounted again.
    if (!py.FS.analyzePath(dir).exists) mountSame(py, dir)
  }
  if (!py.globals.has('_run_script')) py.runPython(SCRIPT_RUNNER)
  const runner = py.globals.get('_run_script')
  const before = process.cwd()
  process.chdir(cwd)
  try {
    const r = await runner.callPromising(script, py.toPy(run.argv ?? []), cwd)
    const js = r.toJs({ dict_converter: Object.fromEntries })
    r.destroy()
    return js as ScriptResult
  } finally {
    process.chdir(before)
  }
}

export async function main(argv: string[]): Promise<number> {
  if (argv[0] === '--') argv = argv.slice(1)
  const mounts: string[] = []
  let cwd: string | undefined
  while (argv[0]?.startsWith('--')) {
    const flag = argv.shift()!
    if (flag === '--cwd') cwd = argv.shift()
    else if (flag === '--mount') mounts.push(argv.shift()!)
    else throw new Error(`unknown option ${flag}`)
  }
  const [script, ...args] = argv
  if (!script) throw new Error('usage: runScript.ts [--cwd DIR] [--mount DIR]... SCRIPT [ARGS...]')
  const pxr = await loadPxrPython()
  const r = await runPythonScript(pxr, { script, argv: args, cwd, mounts })
  process.stdout.write(r.output)
  return r.exitCode
}
