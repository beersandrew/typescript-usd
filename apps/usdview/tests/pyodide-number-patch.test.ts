// scripts/pyodide-number-patch.ts: the Safari 27.3 workaround for Pyodide's
// JavaScript-to-Python number conversion. Here (Node, unaffected by the
// fault) the patched runtime must convert every kind of number exactly as
// Pyodide's own does, and keep doing so past the few thousand conversions
// after which Safari's goes wrong (checked in Safari by
// scripts/interpreter-session).
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { patchPyodideAsm } from '../scripts/pyodide-number-patch'

// The library's Pyodide, as scripts/pxr-python.ts serves it.
const pyodideDir = path.resolve(__dirname, '../../../packages/usd/node_modules/pyodide')
const VALUES = [0, -0, 1, -7, 30, 2147483647, -2147483648, 2147483648, 2 ** 40, -(2 ** 53 - 1), 2 ** 53, 1e20, 0.5, -1.25, Math.PI,
  1 / 3, 359.50138092041016, 5e-324, 1.7976931348623157e308, 1e300, Infinity, -Infinity, NaN]

async function convert(indexURL: string) {
  const { loadPyodide } = await import(/* @vite-ignore */ path.join(pyodideDir, 'pyodide.mjs')) as { loadPyodide: (o: { indexURL: string }) => Promise<{ globals: { set(key: string, value: unknown): void }, runPython(code: string): { toJs(): unknown[] } }> }
  const py = await loadPyodide({ indexURL })
  py.globals.set('VALUES', VALUES)
  return py.runPython(`
import math
out = []
for i in range(5000):
    for v in VALUES:
        if i in (0, 4999):
            out.append((type(v).__name__, repr(v), math.copysign(1, v) if isinstance(v, float) else 0))
out`).toJs()
}

describe('Pyodide number conversion patch', () => {
  it('patches exactly one place and refuses a different Pyodide', () => {
    const source = readFileSync(path.join(pyodideDir, 'pyodide.asm.mjs'), 'utf8')
    const patched = patchPyodideAsm(source)
    expect(patched).toMatch(/^\/\/ Modified by typescript-usd/)
    expect(patched).toContain('__tsusdNumberToPython')
    expect(patchPyodideAsm(patched)).toBe(patched)
    expect(() => patchPyodideAsm('export {}')).toThrow(/number conversion to patch was not found/)
  })

  it('converts every kind of number as Pyodide does', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pyodide-patched-'))
    for (const name of ['pyodide.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json', 'package.json'])
      symlinkSync(path.join(pyodideDir, name), path.join(dir, name))
    writeFileSync(path.join(dir, 'pyodide.asm.mjs'), patchPyodideAsm(readFileSync(path.join(pyodideDir, 'pyodide.asm.mjs'), 'utf8')))
    const [patched, original] = [await convert(`${dir}/`), await convert(`${pyodideDir}/`)]
    expect(patched).toEqual(original)
    expect(patched.length).toBe(VALUES.length * 2)
  }, 120_000)
})
