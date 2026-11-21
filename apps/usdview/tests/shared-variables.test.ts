// Variables shared between the two interpreter windows
// (src/shared-variables.ts, a web addition): the TypeScript console's `py`
// and the Python console's `ts` read and write the other console's
// variables, library objects crossing as the core's own objects. The Python
// console runs in Node's Pyodide with JSPI (vitest.config.ts).
import { beforeAll, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { Sphere } from 'typescript-usd/usdGeom'
import { Vec3d as GfVec3d } from 'typescript-usd/gf'
import { loadPxrPython } from '../../../packages/usd/python/runUpstream'
import { createPxrInteractive } from '../../../packages/usd/python/interactive'
import type { InterpreterLanguage } from '../src/interpreter-language'
import { seededPythonInterpreter } from '../src/py-interpreter'
import { createTypeScriptInterpreter } from '../src/ts-interpreter'
import { InterpreterPeerRegistry } from '../src/shared-variables'
import { UsdviewApi, type UsdviewAppController } from '../src/usdview-api'

describe('shared variables', () => {
  let stage: Stage
  let python: InterpreterLanguage
  let typescript: InterpreterLanguage
  const peers = new InterpreterPeerRegistry()
  const run = (lang: () => InterpreterLanguage) => async (source: string, expectError = false) => {
    let text = '', failed = false
    await lang().runSource(source, { write: (t, style = 'output') => { text += t; if (style !== 'output') failed = true } })
    if (failed !== expectError) throw new Error(`${source}\n${text}`)
    return text.trim()
  }
  const py = run(() => python), ts = run(() => typescript)

  beforeAll(async () => {
    stage = await Stage.open(Layer.createAnonymous())
    stage.definePrim('/World', 'Xform')
    const usdviewApi = new UsdviewApi({ stage: () => stage, selectionState: () => ({ selections: [{ path: '/World' }], focusPath: '/World', lcdPaths: ['/World'] }) } as unknown as UsdviewAppController)
    typescript = await createTypeScriptInterpreter({ usdviewApi, peers })
    // The Python window is not open yet: `py` says so.
    expect(await ts('py.anything', true)).toMatch(/The Python Interpreter has not been opened: open Window > Python Interpreter/)
    expect(await ts('Object.keys(py)')).toBe('[]')
    peers.register('typescript', typescript)
    python = await seededPythonInterpreter(createPxrInteractive((await loadPxrPython()).pyodide), { usdviewApi, peers })
    peers.register('python', python)
  }, 120_000)

  it('reads TypeScript numbers, strings, arrays and objects in Python', async () => {
    await ts("const count = 3; const label = 'hi'; const names = ['a', 'b']; const options = { size: 2, on: true }")
    expect(await py('ts.count, ts.label, ts.names, ts.options')).toBe("(3, 'hi', ['a', 'b'], {'size': 2, 'on': True})")
    expect(await py('sorted(dir(ts))')).toBe("['count', 'label', 'names', 'options']")
    expect(await py('ts.nope', true)).toMatch(/AttributeError: the TypeScript console has no variable 'nope'/)
  })

  it('reads Python values in TypeScript and sets them back', async () => {
    await py("radius = 2.5; tags = ('x', 'y'); spec = {'kind': 'ball', 'sizes': [1, 2]}")
    expect(await ts('[py.radius, py.tags, py.spec]')).toBe("[ 2.5, [ 'x', 'y' ], { kind: 'ball', sizes: [ 1, 2 ] } ]")
    expect(await ts('Object.keys(py).sort()')).toBe("[ 'radius', 'spec', 'tags' ]")
    await ts('py.radius = 4')
    expect(await py('radius')).toBe('4')
    expect(await ts('py.missing')).toBe('')
    // Printed whole, and completed with Tab.
    expect(await ts('py')).toBe("{ radius: 4, tags: [ 'x', 'y' ], spec: { kind: 'ball', sizes: [ 1, 2 ] } }")
    expect(await py('ts')).toBe('<TypeScript variables: count, label, names, options>')
    expect(typescript.complete('py.ra')).toEqual(['py.radius'])
    expect(python.complete('ts.cou')).toEqual(['ts.count'])
  })

  it('shares library objects as the same core objects', async () => {
    await py("ball = UsdGeom.Sphere.Define(usdviewApi.stage, '/World/Ball')")
    // TypeScript gets the core's UsdGeomSphere over the same prim.
    expect(await ts('py.ball instanceof UsdGeom.Sphere && py.ball.prim.path')).toBe("'/World/Ball'")
    await ts('py.ball.getRadiusAttr().set(7)')
    expect(await py('ball.GetRadiusAttr().Get()')).toBe('7.0')
    // And Python gets its forwarding classes for TypeScript's objects.
    await ts("const box = usdviewApi.stage.definePrim('/World/Box', 'Cube'); const offset = new Gf.Vec3d(1, 2, 3)")
    expect(await py('type(ts.box).__name__, ts.box.GetPath(), ts.offset')).toBe("('Prim', Sdf.Path('/World/Box'), Gf.Vec3d(1.0, 2.0, 3.0))")
    await py('ts.moved = Gf.Vec3d(4, 5, 6)')
    expect(await ts('moved instanceof Gf.Vec3d && String(moved)')).toBe("'(4, 5, 6)'")
    expect((typescript.locals.moved as GfVec3d) instanceof GfVec3d).toBe(true)
    expect(stage.getPrim('/World/Ball') && new Sphere(stage.getPrim('/World/Ball')).getRadiusAttr().get()).toBe(7)
  })

  it('calls functions across, converting their arguments and results', async () => {
    await py('def double(x):\n    return x * 2\n')
    expect(await ts('py.double(21)')).toBe('42')
    await ts('const grow = (sphere, radius) => { sphere.getRadiusAttr().set(radius); return sphere.prim.path }')
    expect(await py('ts.grow(ball, 9)')).toBe("'/World/Ball'")
    expect(await py('ball.GetRadiusAttr().Get()')).toBe('9.0')
    // An async TypeScript function is awaited for Python.
    await ts('const later = async (n) => n + 1')
    expect(await py('ts.later(1)')).toBe('2')
  })
})
