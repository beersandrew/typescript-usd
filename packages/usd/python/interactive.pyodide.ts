// The interactive session of Window > Python Interpreter (interactive.ts):
// usdview's Interpreter, Controller streams and _Completer
// (OpenUSD 26.11.1 usdviewq/pythonInterpreter.py) under Pyodide over the pxr
// forwarding layer: `pnpm test:python`. Expected text is what CPython's
// code.InteractiveInterpreter itself prints; these tests check the session
// routes it (output, syntax-error and traceback styles, incomplete input).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadPxrPython } from './runUpstream.ts'
import { createPxrInteractive, type PxrInteractive } from './interactive.ts'

let session: PxrInteractive
const text = (output: [string, string][], style?: string) =>
  output.filter(([, s]) => style === undefined || s === style).map(([t]) => t).join('')

beforeAll(async () => {
  const py = await loadPxrPython()
  session = createPxrInteractive(py.pyodide)
})

describe('Python interactive session', () => {
  it('has the banner and prompts of pythonInterpreter.py', () => {
    expect(session.banner).toMatch(/^Python 3\.\d+\.\d+ .* on emscripten\.$/s)
    expect([session.ps1, session.ps2]).toEqual(['>>> ', '... '])
  })

  it('prints expression results and print() output in the output style', async () => {
    expect(await session.runSource('6 * 7')).toEqual({ more: false, output: [['42', 'output'], ['\n', 'output']] })
    const r = await session.runSource('print("hello")')
    expect(text(r.output, 'output')).toBe('hello\n')
  })

  it('asks for more input until a block is complete, keeping locals', async () => {
    expect((await session.runSource('def twice(v):')).more).toBe(true)
    expect((await session.runSource('def twice(v):\n    return v * 2')).more).toBe(true)
    expect((await session.runSource('def twice(v):\n    return v * 2\n')).more).toBe(false)
    expect(text((await session.runSource('twice(21)')).output)).toBe('42\n')
  })

  it('shows syntax errors and tracebacks in their own styles', async () => {
    const syntax = await session.runSource('1 +* 2')
    expect(syntax.more).toBe(false)
    expect(text(syntax.output, 'syntaxError')).toMatch(/SyntaxError: invalid syntax\n$/)
    expect(text(syntax.output, 'traceback')).toBe('')
    const error = await session.runSource('1 / 0')
    expect(text(error.output, 'traceback')).toMatch(/^Traceback \(most recent call last\):\n[\s\S]*ZeroDivisionError: division by zero\n$/)
  })

  it('imports pxr and runs core calls that return Promises (run_sync)', async () => {
    await session.runSource('from pxr import Sdf, Usd')
    expect(text((await session.runSource("Sdf.Path('/World/A').GetParentPath()")).output)).toBe("Sdf.Path('/World')\n")
    const opened = await session.runSource('stage = Usd.Stage.Open(Sdf.Layer.CreateAnonymous())')
    expect(opened.output).toEqual([])
    expect(text((await session.runSource('stage.DefinePrim("/World", "Xform").GetPath()')).output)).toBe("Sdf.Path('/World')\n")
    expect(text((await session.runSource('stage.GetPrimAtPath("/World").GetTypeName()')).output)).toBe("'Xform'\n")
  })

  it('completes names and attributes as _Completer does', async () => {
    expect(session.complete('twi')).toEqual(['twice'])
    expect(session.complete('Sdf.Pat')).toContain('Sdf.Path')
    expect(session.complete('nothing.here')).toEqual([])
  })

  it('writes help() into the console and refuses input()', async () => {
    expect(text((await session.runSource('help(len)')).output)).toContain('len(obj, /)')
    expect(text((await session.runSource('input()')).output, 'traceback')).toContain('RuntimeError: input() is not supported in the browser interpreter.')
  })

  it('exec runs setup code in the locals without output', async () => {
    await session.exec('seeded = 5')
    expect(session.locals.get('seeded')).toBe(5)
    expect(text((await session.runSource('seeded + 1')).output)).toBe('6\n')
  })
})
