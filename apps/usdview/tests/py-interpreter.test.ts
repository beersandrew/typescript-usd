// Window > Python Interpreter (src/py-interpreter.ts): usdview's own console
// language, Python under Pyodide over the pxr forwarding layer, seeded as
// OpenUSD 26.11.1 usdviewq/pythonInterpreter.py Myconsole and
// _DoAutoImports seed it, with usdviewApi (usdviewApi.py) forwarding to the
// viewer's port. The session runs in Node's Pyodide (python/runUpstream.ts);
// core calls that return Promises need JSPI, which vitest.config.ts turns on
// for the test forks (--experimental-wasm-jspi).
import { beforeAll, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { loadPxrPython } from '../../../packages/usd/python/runUpstream'
import { createPxrInteractive } from '../../../packages/usd/python/interactive'
import type { InterpreterOutputStyle } from '../src/interpreter-language'
import { seededPythonInterpreter, type PythonInterpreter } from '../src/py-interpreter'
import { UsdviewApi, type UsdviewAppController } from '../src/usdview-api'

it('runs with JSPI', () => {
  expect(typeof (WebAssembly as unknown as { Suspending?: unknown }).Suspending).toBe('function')
})

describe('Python interpreter language', () => {
  let lang: PythonInterpreter
  let stage: Stage
  let status = ''
  let viewerMode = false
  let frame = 1
  const selected: string[] = []
  const out: { text: string, style: InterpreterOutputStyle }[] = []
  const run = async (source: string) => {
    out.length = 0
    const more = await lang.runSource(source, { write: (text, style = 'output') => out.push({ text, style }) })
    return { more, text: out.map(o => o.text).join(''), styles: [...new Set(out.map(o => o.style))] }
  }

  beforeAll(async () => {
    stage = await Stage.open(Layer.createAnonymous())
    stage.definePrim('/World', 'Xform')
    stage.definePrim('/World/A', 'Cube')
    const app = {
      stage: () => stage,
      selectionState: () => ({ selections: [{ path: '/World/A' }], focusPath: '/World/A', lcdPaths: ['/World/A'] }),
      statusMessage: (message: string) => { status = message },
      isViewerMode: () => viewerMode,
      setViewerMode: (value: boolean) => { viewerMode = value },
      currentFrame: () => frame,
      setCurrentFrame: async (time: number) => { frame = time },
      updatePrimSelection: (path: string) => { selected.push(path) },
    } as unknown as UsdviewAppController
    const py = await loadPxrPython()
    lang = await seededPythonInterpreter(createPxrInteractive(py.pyodide), { usdviewApi: new UsdviewApi(app) })
  }, 120_000)

  it('has the Python banner and prompts', () => {
    expect(lang.title).toBe('Python Interpreter')
    expect(lang.banner).toMatch(/^Python 3\..* on emscripten\.$/s)
    expect([lang.ps1, lang.ps2]).toEqual(['>>> ', '... '])
  })

  it('seeds the pxr modules under their names, as _DoAutoImports does', async () => {
    expect((await run('Sdf.Path("/a/b").name')).text).toBe("'b'\n")
    expect((await run('Usd.__name__, UsdGeom.__name__')).text).toBe("('pxr.Usd', 'pxr.UsdGeom')\n")
  })

  it('reads the viewer through usdviewApi with usdviewApi.py names', async () => {
    expect((await run('usdviewApi.stage.GetPrimAtPath("/World/A").GetTypeName()')).text).toBe("'Cube'\n")
    expect((await run('usdviewApi.prim.GetPath()')).text).toBe("Sdf.Path('/World/A')\n")
    expect((await run('usdviewApi.prim.GetName(), usdviewApi.stage.GetPseudoRoot().GetName()')).text).toBe("('A', '/')\n")
    expect((await run('usdviewApi.selectedPaths')).text).toBe("['/World/A']\n")
    await run('usdviewApi.PrintStatus("from Python")')
    expect(status).toBe('from Python')
    await run('usdviewApi.viewerMode = True')
    expect(viewerMode).toBe(true)
    expect((await run('usdviewApi.viewerMode')).text).toBe('True\n')
    expect(lang.locals.usdviewApi).toBeDefined()
  })

  it('traverses the stage as prims, in the library\'s traversal order', async () => {
    // UsdStage::Traverse is a UsdPrimRange of prims (the core's
    // stage.traverse() yields their paths).
    await run('prims = list(usdviewApi.stage.Traverse())')
    expect((await run('[str(p.GetPath()) for p in prims]')).text).toBe(`${JSON.stringify([...stage.traverse()]).replace(/"/g, "'").replace(/,/g, ', ')}\n`)
    expect((await run('type(prims[0]).__name__')).text).toBe("'Prim'\n")
    expect((await run('[str(p.GetPath()) for p in usdviewApi.stage.TraverseAll()] == [str(p.GetPath()) for p in prims]')).text).toBe('True\n')
    await run('usdviewApi.AddPrimToSelection(prims[0])')
    expect(selected).toContain(stage.traverse()[Symbol.iterator]().next().value)
  })

  it('prints the frame as upstream Usd.TimeCode does and documents usdviewApi', async () => {
    expect((await run('usdviewApi.frame')).text).toBe('Usd.TimeCode(1.0)\n')
    expect((await run('usdviewApi.frame == Usd.TimeCode(1)')).text).toBe('True\n')
    expect((await run('usdviewApi.PrintStatus.__doc__')).text).toBe("'Prints a status message.'\n")
    expect((await run('help(usdviewApi)')).text).toMatch(/class UsdviewApi[\s\S]*PrintStatus\(self, \*args\)\n \|\s+Prints a status message\.[\s\S]*\|  stage\n \|\s+The current Usd\.Stage\./)
    expect((await run('usdviewApi.stage = None')).styles).toEqual(['traceback'])
  })

  it('sets the frame through usdviewApi.dataModel.currentFrame, as rootDataModel.py does', async () => {
    await run('usdviewApi.dataModel.currentFrame = Usd.TimeCode(12)')
    expect(frame).toBe(12)
    expect((await run('usdviewApi.dataModel.currentFrame')).text).toBe('Usd.TimeCode(12.0)\n')
    // rootDataModel.py:152-162: anything but a Usd.TimeCode is a ValueError.
    expect((await run('usdviewApi.dataModel.currentFrame = 3')).text).toMatch(/ValueError: Expected Usd.TimeCode, got: 3/)
    await run('usdviewApi.dataModel.currentFrame = Usd.TimeCode(1)')
  })

  it('completes usdviewApi members and keeps errors in their styles', async () => {
    expect(lang.complete('usdviewApi.Print')).toEqual(['usdviewApi.PrintStatus'])
    expect(lang.complete('usdviewApi.sta')).toEqual(expect.arrayContaining(['usdviewApi.stage', 'usdviewApi.stageIdentifier']))
    expect(lang.complete('usdviewApi.qMain')).toEqual([])
    expect(await run('if True:')).toMatchObject({ more: true, text: '' })
    expect((await run('usdviewApi.nope')).styles).toEqual(['traceback'])
    expect((await run('1 +* 2')).styles).toEqual(['syntaxError'])
  })
})
