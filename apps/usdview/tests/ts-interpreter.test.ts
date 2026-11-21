// @vitest-environment jsdom
// Window > TypeScript Interpreter's language (src/ts-interpreter.ts): the
// console behaviour of OpenUSD 26.11.1 usdviewq/pythonInterpreter.py
// (code.InteractiveInterpreter.runsource and _Completer) for TypeScript.
// Library values are checked against the library itself, not hand-derived.
import { describe, expect, it } from 'vitest'
import * as Usd from 'typescript-usd/usd'
import * as Gf from 'typescript-usd/gf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { InterpreterLanguage, InterpreterOutputStyle } from '../src/interpreter-language'
import { compileEntry, createTypeScriptInterpreter, formatValue, seededModules, stripTypes } from '../src/ts-interpreter'
import { UsdviewApi, type UsdviewAppController } from '../src/usdview-api'

const api = new UsdviewApi({ stage: () => null, selectionState: () => ({ selections: [{ path: '/' }], focusPath: '/', lcdPaths: ['/'] }) } as unknown as UsdviewAppController)
async function language() {
  const lang = await createTypeScriptInterpreter({ usdviewApi: api })
  const out: { text: string, style: InterpreterOutputStyle }[] = []
  const run = async (source: string) => {
    out.length = 0
    const more = await lang.runSource(source, { write: (text, style = 'output') => out.push({ text, style }) })
    return { more, text: out.map(o => o.text).join(''), styles: out.map(o => o.style) }
  }
  return { lang, run }
}

describe('TypeScript type stripping', () => {
  it('strips annotations, generics, assertions and declarations, keeping imports', () => {
    expect(stripTypes('const x: number = 1').trim()).toBe('const x = 1')
    expect(stripTypes('function f<T>(a: T): T { return a }')).toBe('function f(a) { return a }')
    expect(stripTypes('interface I { a: number }').trim()).toBe('')
    expect(stripTypes('(a as Foo)!.b satisfies Bar').replace(/\s+/g, '')).toBe('(a).b')
    expect(stripTypes("import { Stage } from 'typescript-usd/usd'")).toContain('import { Stage }')
  })
  it('reports input that ends inside a construct as incomplete and rejects value namespaces', () => {
    for (const source of ['function f(', 'if (x) {', 'const s = `abc', 'foo(1,'])
      expect(() => stripTypes(source)).toThrow(expect.objectContaining({ incomplete: true }))
    expect(() => stripTypes('const = 1')).toThrow(expect.objectContaining({ incomplete: false }))
    expect(() => stripTypes('namespace N { export const a = 1 }')).toThrow(/namespaces/)
  })
  it('turns top-level declarations into scope assignments and returns a final expression', () => {
    expect(compileEntry('const {a, b: [c]} = obj; a + c').body).toContain('return (a + c);')
    expect(compileEntry('let x = 1').declared).toEqual(['x'])
    expect(compileEntry('function f() {}\nclass C {}').declared).toEqual(['f', 'C'])
    expect(compileEntry('x = 3').body).not.toContain('return')
  })
})

describe('TypeScript interpreter', () => {
  it('prints the value of an expression, but not undefined or an assignment', async () => {
    const { run } = await language()
    expect(await run('1 + 2')).toEqual({ more: false, text: '3\n', styles: ['output'] })
    expect((await run("'a' + 'b'")).text).toBe("'ab'\n")
    expect((await run('[1, 2, { a: 3 }]')).text).toBe('[ 1, 2, { a: 3 } ]\n')
    expect((await run('{a: 1}')).text).toBe('{ a: 1 }\n')
    expect((await run('undefined')).text).toBe('')
    expect((await run('let y = 2')).text).toBe('')
    expect((await run('y = 5')).text).toBe('')
  })
  it('keeps variables, functions and classes across entries', async () => {
    const { run, lang } = await language()
    await run('const n: number = 41')
    await run('function inc(v: number): number { return v + 1 }')
    await run('class Box<T> { constructor(public value: T) {} }')
    expect((await run('inc(n)')).text).toBe('42\n')
    expect((await run('new Box(inc(n)).value')).text).toBe('42\n')
    await run('let name = "shadowed global"')
    expect((await run('name')).text).toBe("'shadowed global'\n")
    await run('undeclared = 7')
    expect(lang.locals.undeclared).toBe(7)
    expect((globalThis as Record<string, unknown>).undeclared).toBeUndefined()
  })
  it('runs top-level await, as Stage.open needs', async () => {
    const { run } = await language()
    await run('const stage = await Usd.Stage.open(Sdf.Layer.createAnonymous())')
    await run("stage.definePrim('/World', 'Xform')")
    expect((await run("stage.getPrim('/World')!.typeName")).text).toBe("'Xform'\n")
    expect((await run('await Promise.resolve(3)')).text).toBe('3\n')
  })
  it('writes syntax errors and exceptions with their message in the error styles', async () => {
    const { run } = await language()
    const syntax = await run('const = 1')
    expect(syntax.styles).toEqual(['syntaxError'])
    expect(syntax.text).toMatch(/^ {2}File "<input>", line 1\n {4}const = 1\n {4}\s*\^\nSyntaxError: /)
    const thrown = await run('function boom() { throw new RangeError("bad frame") }\nboom()')
    expect(thrown.styles).toEqual(['traceback'])
    expect(thrown.text).toMatch(/^RangeError: bad frame\n/)
    expect(thrown.text).toContain('boom')
    expect((await run('missingName')).text).toMatch(/^ReferenceError: missingName is not defined/)
    expect((await run('throw 5')).text).toBe('Uncaught 5\n')
  })
  it('asks for more input while an entry is incomplete', async () => {
    const { run } = await language()
    expect((await run('function f(a: number) {')).more).toBe(true)
    expect((await run('function f(a: number) {\n  return a * 2')).more).toBe(true)
    expect((await run('function f(a: number) {\n  return a * 2\n}')).more).toBe(false)
    expect((await run('f(4)')).text).toBe('8\n')
  })
  it('sends console output to the console while an entry runs', async () => {
    const { run } = await language()
    const log = console.log
    expect((await run("console.log('x', 1, [2]); console.error('e')")).text).toBe('x 1 [ 2 ]\ne\n')
    expect(console.log).toBe(log)
  })
  it('seeds usdviewApi, help and the library modules under their upstream names', async () => {
    const { lang, run } = await language()
    for (const name of ['Usd', 'Sdf', 'Gf', 'Tf', 'Vt', 'UsdGeom', 'UsdShade', 'UsdLux', 'UsdSkel', 'UsdUtils', 'UsdValidation', 'Kind', 'Pcp', 'Ar', 'Plug'])
      expect(lang.locals[name], name).toBe(seededModules[name])
    expect(lang.locals.usdviewApi).toBe(api)
    expect((await run('Usd.Stage === Stage')).text).toMatch(/ReferenceError/)
    expect((await run('typeof Usd.Stage.open')).text).toBe("'function'\n")
    expect((await run("Sdf.Path.fromString('/A/B').getParentPath().pathString")).text).toBe("'/A'\n")
    expect((await run('new Gf.Vec3d(1, 2, 3)')).text).toBe(`Gf.Vec3d(${String(new Gf.Vec3d(1, 2, 3))})\n`)
    const help = await run('help(usdviewApi)')
    expect(help.text).toContain('Help on UsdviewApi object')
    expect(help.text).toContain('The current Usd.Stage.')
    expect((await run("import { Stage } from 'typescript-usd/usd'\nStage === Usd.Stage")).text).toBe('true\n')
  })
  it('prints prims and stages in the form of their Python reprs', async () => {
    const stage = await Usd.Stage.open((await import('typescript-usd/sdf')).Layer.createAnonymous())
    const prim = stage.definePrim('/World', 'Xform')
    expect(formatValue(prim)).toBe('Usd.Prim(</World>)')
    expect(formatValue(stage)).toBe(`Usd.Stage(rootLayer='${stage.getRootLayer().identifier}')`)
    expect(formatValue(SdfPath.fromString('/A'))).toBe(`Sdf.Path(${String(SdfPath.fromString('/A'))})`)
  })
  it('completes names and attributes as _Completer does', async () => {
    const { lang }: { lang: InterpreterLanguage } = await language()
    expect(lang.complete('usdview')).toEqual(['usdviewApi'])
    expect(lang.complete('UsdGe')).toEqual(['UsdGeom'])
    const attrs = lang.complete('usdviewApi.sel')
    expect(attrs.sort()).toEqual(['usdviewApi.selectedInstances', 'usdviewApi.selectedPaths', 'usdviewApi.selectedPrims'])
    expect(lang.complete('x = Usd.Sta').some(word => word === 'x = Usd.Stage')).toBe(true)
    expect(lang.complete('nothing.here')).toEqual([])
  })
})
